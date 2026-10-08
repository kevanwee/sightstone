import type { ContractualEffect } from "@prisma/client";
import { db } from "@/lib/db";
import { extractClausesFromText, compareClauses } from "@/lib/ai";
import type {
  ClauseExtractionResult,
  ComparisonResult,
} from "@/lib/analysis-validation";
import {
  ANALYSIS_LEASE_MS,
  ANALYSIS_TIMEOUT_MS,
  MAX_ANALYSIS_CONTRACTS,
  MAX_CONTRACT_CHARS,
} from "@/lib/analysis-validation";
import { PlaybookError, playbookWhere } from "@/lib/playbook-access";

export async function analysePlaybook(id: string, userId: string) {
  // Claim atomically. Other playbook mutations lock this same row.
  const snapshot = await db.$transaction(async (tx) => {
    const playbook = await tx.playbook.findFirst({
      where: playbookWhere(id, userId, true),
      include: { contracts: true, _count: { select: { clauseGroups: true } } },
    });
    if (!playbook) {
      throw new PlaybookError(404, "Playbook not found or access denied");
    }
    if (
      playbook.status === "ANALYSING" &&
      Date.now() - playbook.updatedAt.getTime() < ANALYSIS_LEASE_MS
    ) {
      throw new PlaybookError(409, "Analysis is already running");
    }
    const contracts = playbook.contracts;
    if (contracts.length < 2 || contracts.length > MAX_ANALYSIS_CONTRACTS) {
      throw new PlaybookError(
        400,
        `Analysis supports 2 to ${MAX_ANALYSIS_CONTRACTS} contracts per playbook.`,
      );
    }
    if (
      contracts.some(
        (c) =>
          !c.rawText?.trim() ||
          c.status === "ERROR" ||
          c.rawText.length > MAX_CONTRACT_CHARS,
      )
    ) {
      throw new PlaybookError(
        400,
        `Every contract must have readable text of at most ${MAX_CONTRACT_CHARS.toLocaleString()} characters. No text is silently truncated; split larger documents before analysis.`,
      );
    }
    const lease = new Date(
      Math.max(Date.now(), playbook.updatedAt.getTime() + 1),
    );
    const claimed = await tx.playbook.updateMany({
      where: {
        ...playbookWhere(id, userId, true),
        updatedAt: playbook.updatedAt,
        status: playbook.status,
      },
      data: { status: "ANALYSING", updatedAt: lease },
    });
    if (!claimed.count) {
      throw new PlaybookError(409, "Playbook changed. Please retry.");
    }
    const fallback =
      playbook.status === "ANALYSING"
        ? playbook._count.clauseGroups
          ? "REVIEW"
          : "DRAFT"
        : playbook.status;
    return { contracts, lease, fallback };
  });
  const leaseWhere = {
    id,
    status: "ANALYSING" as const,
    updatedAt: snapshot.lease,
  };
  const signal = AbortSignal.timeout(ANALYSIS_TIMEOUT_MS);
  try {
    type Item = ClauseExtractionResult["clauses"][number] & {
      contractId: string;
      contractName: string;
    };
    const groups = new Map<
      string,
      {
        clauseType: string;
        effect: ContractualEffect;
        items: Item[];
        comparison?: ComparisonResult;
      }
    >();
    // The complete computation happens before touching saved clauses or decisions.
    for (const contract of snapshot.contracts) {
      signal.throwIfAborted();
      const result = await extractClausesFromText(
        contract.rawText!,
        contract.name,
        signal,
      );
      for (const clause of result.clauses) {
        const key = JSON.stringify([
          clause.clauseType,
          clause.contractualEffect,
        ]);
        const group = groups.get(key) ?? {
          clauseType: clause.clauseType,
          effect: clause.contractualEffect,
          items: [],
        };
        group.items.push({
          ...clause,
          contractId: contract.id,
          contractName: contract.name,
        });
        groups.set(key, group);
      }
    }
    for (const group of Array.from(groups.values())) {
      signal.throwIfAborted();
      if (new Set(group.items.map((c) => c.contractId)).size > 1) {
        group.comparison = await compareClauses(
          group.clauseType,
          group.effect,
          group.items.map((c) => ({
            contractName: c.contractName,
            text: c.originalText,
          })),
          signal,
        );
      }
    }
    signal.throwIfAborted();
    await db.$transaction(
      async (tx) => {
        const owned = await tx.playbook.updateMany({
          where: {
            ...leaseWhere,
            organisation: playbookWhere(id, userId, true).organisation,
          },
          data: { status: "REVIEW" },
        });
        if (!owned.count) {
          throw new PlaybookError(
            409,
            "Analysis was superseded or access changed. Please refresh.",
          );
        }
        await tx.clause.deleteMany({ where: { contract: { playbookId: id } } });
        await tx.clauseGroup.deleteMany({ where: { playbookId: id } });
        for (const group of Array.from(groups.values())) {
          await tx.clauseGroup.create({
            data: {
              playbookId: id,
              clauseType: group.clauseType,
              contractualEffect: group.effect,
              overlapSummary: group.comparison?.overlapSummary,
              aiSuggestedWording: group.comparison?.aiSuggestedWording,
              harmonisationStatus: group.comparison
                ? "OVERLAP_IDENTIFIED"
                : "PENDING",
              clauses: {
                create: group.items.map((c) => ({
                  contractId: c.contractId,
                  originalText: c.originalText,
                  clauseType: c.clauseType,
                  contractualEffect: c.contractualEffect,
                  riskLevel: c.riskLevel,
                  position: c.position,
                })),
              },
            },
          });
        }
        // Repair legacy PROCESSING records left behind by the old background flow.
        await tx.contract.updateMany({
          where: { playbookId: id },
          data: { status: "PROCESSED" },
        });
      },
      { timeout: 10000 },
    );
    return { status: "REVIEW" };
  } catch (error) {
    // A stale worker cannot reset a newer attempt. Saved results remain intact.
    await db.playbook.updateMany({
      where: leaseWhere,
      data: { status: snapshot.fallback },
    });
    if (error instanceof PlaybookError) {
      throw error;
    }
    throw new PlaybookError(
      signal.aborted ? 504 : 502,
      "Analysis could not complete. Saved results were preserved. Retry, or use shorter contracts.",
    );
  }
}
