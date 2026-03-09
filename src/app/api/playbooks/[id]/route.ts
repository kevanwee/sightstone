import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// ─── GET /api/playbooks/[id] ──────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const playbook = await db.playbook.findUnique({
    where: { id },
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

  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ playbook });
}

// ─── PATCH /api/playbooks/[id] ────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json();

  const playbook = await db.playbook.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status && { status: body.status }),
    },
  });

  return NextResponse.json({ playbook });
}

// ─── DELETE /api/playbooks/[id] ───────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  await db.playbook.delete({ where: { id } });

  return NextResponse.json({ message: "Deleted" });
}
