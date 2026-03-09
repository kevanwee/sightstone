import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const HarmoniseSchema = z.object({
  groupId: z.string(),
  action: z.enum(["select_existing", "use_ai", "custom"]),
  preferredClauseId: z.string().optional(),   // for select_existing
  customWording: z.string().optional(),         // for custom
});

// ─── POST /api/playbooks/[id]/harmonise  (save selection for a clause group) ──
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playbookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json();
  const parsed = HarmoniseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { groupId, action, preferredClauseId, customWording } = parsed.data;

  // Verify group belongs to playbook
  const group = await db.clauseGroup.findFirst({
    where: { id: groupId, playbookId },
    include: { clauses: true },
  });

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let chosenWording: string | null = null;
  let status: "USER_SELECTED" | "AI_SUGGESTED" | "FINALISED" = "USER_SELECTED";

  if (action === "use_ai") {
    chosenWording = group.aiSuggestedWording;
    status = "AI_SUGGESTED";
  } else if (action === "select_existing" && preferredClauseId) {
    const clause = group.clauses.find((c) => c.id === preferredClauseId);
    if (!clause) return NextResponse.json({ error: "Clause not found in group" }, { status: 404 });
    chosenWording = clause.originalText;
    status = "USER_SELECTED";
  } else if (action === "custom" && customWording) {
    chosenWording = customWording;
    status = "FINALISED";
  }

  const updated = await db.clauseGroup.update({
    where: { id: groupId },
    data: {
      chosenWording,
      preferredClauseId: action === "select_existing" ? preferredClauseId : null,
      harmonisationStatus: status,
    },
  });

  // Check if all groups are finalised → update playbook status
  const allGroups = await db.clauseGroup.findMany({
    where: { playbookId },
    select: { harmonisationStatus: true },
  });

  const allDone = allGroups.every((g) =>
    ["USER_SELECTED", "AI_SUGGESTED", "FINALISED"].includes(g.harmonisationStatus)
  );

  if (allDone) {
    await db.playbook.update({
      where: { id: playbookId },
      data: { status: "HARMONISED" },
    });
  }

  return NextResponse.json({ group: updated, allHarmonised: allDone });
}

// ─── GET /api/playbooks/[id]/harmonise  (get all clause groups with status) ───
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playbookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const groups = await db.clauseGroup.findMany({
    where: { playbookId },
    include: {
      clauses: {
        include: {
          contract: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { clauseType: "asc" },
  });

  return NextResponse.json({ groups });
}
