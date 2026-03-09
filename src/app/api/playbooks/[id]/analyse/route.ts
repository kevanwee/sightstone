import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { extractClausesFromText, compareClauses } from "@/lib/ai";
import { CONTRACTUAL_EFFECT_ORDER } from "@/lib/utils";

// ─── POST /api/playbooks/[id]/analyse ─────────────────────────────────────────
// Triggers full AI analysis: extract clauses, group by type, compare, suggest wording
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playbookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const playbook = await db.playbook.findUnique({
    where: { id: playbookId },
    include: {
      contracts: { where: { status: "PROCESSED" } },
      organisation: { include: { members: { where: { userId: session.user.id } } } },
    },
  });

  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!playbook.organisation.members.length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (playbook.contracts.length < 2) {
    return NextResponse.json(
      { error: "At least 2 processed contracts are required for analysis" },
      { status: 400 }
    );
  }

  // Mark playbook as analysing
  await db.playbook.update({
    where: { id: playbookId },
    data: { status: "ANALYSING" },
  });

  // Respond immediately — heavy processing continues asynchronously
  // For production, use a queue (e.g., Inngest, Upstash QStash)
  // Here we do it inline for simplicity (works for <5 contracts)
  processPlaybook(playbookId, playbook.contracts).catch((err) => {
    console.error("[ANALYSE] background error", err);
  });

  return NextResponse.json({ message: "Analysis started", status: "ANALYSING" });
}

async function processPlaybook(
  playbookId: string,
  contracts: { id: string; name: string; rawText: string | null }[]
) {
  try {
    // 1. Delete existing clauses and groups for fresh analysis
    await db.clause.deleteMany({ where: { contract: { playbookId } } });
    await db.clauseGroup.deleteMany({ where: { playbookId } });

    // 2. Extract clauses from each contract
    const allClauses: {
      contractId: string;
      contractName: string;
      clauses: Array<{
        originalText: string;
        clauseType: string;
        contractualEffect: string;
        riskLevel: string;
        position: number;
      }>;
    }[] = [];

    for (const contract of contracts) {
      if (!contract.rawText) continue;

      await db.contract.update({
        where: { id: contract.id },
        data: { status: "PROCESSING" },
      });

      const result = await extractClausesFromText(contract.rawText, contract.name);

      // Save clauses
      for (const clause of result.clauses) {
        await db.clause.create({
          data: {
            contractId: contract.id,
            originalText: clause.originalText,
            clauseType: clause.clauseType,
            contractualEffect: clause.contractualEffect as never,
            riskLevel: clause.riskLevel as never,
            position: clause.position,
          },
        });
      }

      await db.contract.update({
        where: { id: contract.id },
        data: { status: "PROCESSED" },
      });

      allClauses.push({
        contractId: contract.id,
        contractName: contract.name,
        clauses: result.clauses,
      });
    }

    // 3. Group clauses by clauseType across contracts
    const typeMap = new Map<
      string,
      { effect: string; items: { contractName: string; text: string; contractId: string }[] }
    >();

    for (const { contractName, clauses } of allClauses) {
      for (const clause of clauses) {
        if (!typeMap.has(clause.clauseType)) {
          typeMap.set(clause.clauseType, {
            effect: clause.contractualEffect,
            items: [],
          });
        }
        typeMap.get(clause.clauseType)!.items.push({
          contractName,
          text: clause.originalText,
          contractId: contracts.find((c) => c.name === contractName)?.id ?? "",
        });
      }
    }

    // 4. For groups with 2+ clauses, run comparison
    for (const [clauseType, { effect, items }] of Array.from(typeMap.entries())) {
      if (items.length < 2) {
        // Single clause — create group but no comparison needed
        const group = await db.clauseGroup.create({
          data: {
            playbookId,
            clauseType,
            contractualEffect: effect as never,
            harmonisationStatus: "PENDING",
          },
        });
        // Link clauses
        await db.clause.updateMany({
          where: {
            clauseType,
            contract: { playbookId },
          },
          data: { clauseGroupId: group.id },
        });
        continue;
      }

      // Run AI comparison
      let comparison;
      try {
        comparison = await compareClauses(clauseType, effect, items);
      } catch (err) {
        console.warn(`[ANALYSE] comparison failed for ${clauseType}:`, err);
        comparison = null;
      }

      const group = await db.clauseGroup.create({
        data: {
          playbookId,
          clauseType,
          contractualEffect: effect as never,
          overlapSummary: comparison?.overlapSummary ?? null,
          aiSuggestedWording: comparison?.aiSuggestedWording ?? null,
          harmonisationStatus: comparison ? "OVERLAP_IDENTIFIED" : "PENDING",
        },
      });

      // Link individual clauses to the group
      await db.clause.updateMany({
        where: {
          clauseType,
          contract: { playbookId },
        },
        data: { clauseGroupId: group.id },
      });
    }

    // 5. Mark playbook as ready for review
    await db.playbook.update({
      where: { id: playbookId },
      data: { status: "REVIEW" },
    });

    console.log(`[ANALYSE] Playbook ${playbookId} analysis complete`);
    void CONTRACTUAL_EFFECT_ORDER; // reference to silence TS unused import warning
  } catch (err) {
    console.error("[ANALYSE] processPlaybook failed:", err);
    await db.playbook.update({
      where: { id: playbookId },
      data: { status: "DRAFT" },
    });
  }
}

// ─── GET /api/playbooks/[id]/analyse (poll status) ────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playbookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const playbook = await db.playbook.findUnique({
    where: { id: playbookId },
    select: { status: true, id: true },
  });

  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ status: playbook.status });
}
