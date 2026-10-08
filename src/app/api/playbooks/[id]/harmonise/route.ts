import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import {
  requirePlaybook,
  playbookWhere,
  withPlaybookWrite,
  PlaybookError,
  playbookErrorResponse,
} from "@/lib/playbook-access";

const HarmoniseSchema = z.discriminatedUnion("action", [
  z.object({
    groupId: z.string().min(1),
    action: z.literal("select_existing"),
    preferredClauseId: z.string().min(1),
  }),
  z.object({ groupId: z.string().min(1), action: z.literal("use_ai") }),
  z.object({
    groupId: z.string().min(1),
    action: z.literal("custom"),
    customWording: z.string().trim().min(1).max(20000),
  }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const parsed = HarmoniseSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new PlaybookError(400, "Invalid selection");
    }
    const data = parsed.data;
    const result = await withPlaybookWrite(id, session.user.id, async (tx) => {
      const playbook = await tx.playbook.findUniqueOrThrow({ where: { id } });
      if (playbook.status === "DRAFT") {
        throw new PlaybookError(
          409,
          "Contracts changed. Run analysis before harmonising.",
        );
      }
      const group = await tx.clauseGroup.findFirst({
        where: { id: data.groupId, playbookId: id },
        include: { clauses: true },
      });
      if (!group) {
        throw new PlaybookError(404, "Group not found");
      }
      const chosenWording =
        data.action === "custom"
          ? data.customWording
          : data.action === "use_ai"
            ? group.aiSuggestedWording
            : group.clauses.find((c) => c.id === data.preferredClauseId)
                ?.originalText;
      if (!chosenWording) {
        throw new PlaybookError(
          400,
          "No wording is available for that selection",
        );
      }
      const updated = await tx.clauseGroup.update({
        where: { id: group.id },
        data: {
          chosenWording,
          preferredClauseId:
            data.action === "select_existing" ? data.preferredClauseId : null,
          harmonisationStatus:
            data.action === "custom"
              ? "FINALISED"
              : data.action === "use_ai"
                ? "AI_SUGGESTED"
                : "USER_SELECTED",
        },
      });
      const remaining = await tx.clauseGroup.count({
        where: {
          playbookId: id,
          harmonisationStatus: {
            notIn: ["USER_SELECTED", "AI_SUGGESTED", "FINALISED"],
          },
        },
      });
      await tx.playbook.update({
        where: { id },
        data: { status: remaining ? "REVIEW" : "HARMONISED" },
      });
      return { group: updated, allHarmonised: remaining === 0 };
    });
    return NextResponse.json(result);
  } catch (error) {
    return playbookErrorResponse(error);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await requirePlaybook(id, session.user.id);
    const groups = await db.clauseGroup.findMany({
      where: { playbook: playbookWhere(id, session.user.id) },
      include: {
        clauses: {
          include: { contract: { select: { id: true, name: true } } },
        },
      },
      orderBy: { clauseType: "asc" },
    });
    return NextResponse.json({ groups });
  } catch (error) {
    return playbookErrorResponse(error);
  }
}
