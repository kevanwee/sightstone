import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { CONTRACTUAL_EFFECT_ORDER, CONTRACTUAL_EFFECT_LABELS } from "@/lib/utils";

// ─── GET /api/playbooks/[id]/export  (download harmonised playbook as text) ───
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playbookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const playbook = await db.playbook.findUnique({
    where: { id: playbookId },
    include: {
      organisation: true,
      clauseGroups: {
        include: {
          clauses: {
            include: { contract: { select: { name: true } } },
          },
        },
      },
      contracts: { select: { name: true } },
    },
  });

  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sort groups by contractual effect order
  const sortedGroups = [...playbook.clauseGroups].sort((a, b) => {
    const orderA = CONTRACTUAL_EFFECT_ORDER[a.contractualEffect] ?? 99;
    const orderB = CONTRACTUAL_EFFECT_ORDER[b.contractualEffect] ?? 99;
    return orderA - orderB;
  });

  // Build text 
  const lines: string[] = [];
  lines.push(`HARMONISED CONTRACT PLAYBOOK`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(`Playbook: ${playbook.name}`);
  lines.push(`Organisation: ${playbook.organisation.name}`);
  lines.push(`Generated: ${new Date().toLocaleDateString("en-GB")}`);
  lines.push(`Contracts included: ${playbook.contracts.map((c) => c.name).join(", ")}`);
  lines.push(`${"=".repeat(60)}\n`);

  for (const group of sortedGroups) {
    const wording = group.chosenWording ?? group.aiSuggestedWording ?? "(No wording selected)";
    const effectLabel = CONTRACTUAL_EFFECT_LABELS[group.contractualEffect] ?? group.contractualEffect;

    lines.push(`${"─".repeat(60)}`);
    lines.push(`CLAUSE TYPE: ${group.clauseType}`);
    lines.push(`CONTRACTUAL EFFECT: ${effectLabel}`);
    lines.push(`STATUS: ${group.harmonisationStatus}`);
    lines.push(`${"─".repeat(60)}`);

    if (group.overlapSummary) {
      lines.push(`\nOVERLAP SUMMARY:\n${group.overlapSummary}`);
    }

    lines.push(`\nHARMONISED WORDING:\n${wording}\n`);

    if (group.clauses.length > 0) {
      lines.push(`SOURCE CLAUSES (${group.clauses.length}):`);
      for (const clause of group.clauses) {
        lines.push(`  • [${clause.contract.name}] ${clause.originalText.substring(0, 150)}...`);
      }
    }

    lines.push("");
  }

  const content = lines.join("\n");
  const filename = `${playbook.name.replace(/\s+/g, "-")}-harmonised-playbook.txt`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
