import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import {
  playbookWhere,
  withPlaybookWrite,
  PlaybookError,
  playbookErrorResponse,
} from "@/lib/playbook-access";

// ─── GET /api/playbooks/[id] ──────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const playbook = await db.playbook.findFirst({
    where: playbookWhere(id, session.user.id),
    include: {
      contracts: {
        include: { _count: { select: { clauses: true } } },
        orderBy: { createdAt: "asc" },
      },
      clauseGroups: {
        include: {
          clauses: {
            include: { contract: { select: { id: true, name: true } } },
          },
        },
        orderBy: { clauseType: "asc" },
      },
      organisation: { select: { id: true, name: true } },
    },
  });

  if (!playbook)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ playbook });
}

// ─── PATCH /api/playbooks/[id] ────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
      })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new PlaybookError(400, "Invalid playbook fields");
    }
    const playbook = await withPlaybookWrite(id, session.user.id, (tx) =>
      tx.playbook.update({ where: { id }, data: parsed.data }),
    );
    return NextResponse.json({ playbook });
  } catch (error) {
    return playbookErrorResponse(error);
  }
}

// ─── DELETE /api/playbooks/[id] ───────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    await withPlaybookWrite(id, session.user.id, (tx) =>
      tx.playbook.delete({ where: { id } }),
    );
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    return playbookErrorResponse(error);
  }
}
