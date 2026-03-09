import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { z } from "zod";

async function getOrgForUser(userId: string) {
  const membership = await db.organisationMember.findFirst({
    where: { userId },
    include: { organisation: true },
    orderBy: { joinedAt: "asc" },
  });
  return membership?.organisation ?? null;
}

// ─── GET /api/playbooks ───────────────────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const org = await getOrgForUser(session.user.id);
  if (!org) return NextResponse.json({ error: "No organisation found" }, { status: 404 });

  const playbooks = await db.playbook.findMany({
    where: { organisationId: org.id },
    include: {
      _count: { select: { contracts: true, clauseGroups: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ playbooks, org });
}

// ─── POST /api/playbooks ──────────────────────────────────────────────────────
const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const org = await getOrgForUser(session.user.id);
  if (!org) return NextResponse.json({ error: "No organisation found" }, { status: 404 });

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const playbook = await db.playbook.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        organisationId: org.id,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ playbook }, { status: 201 });
  } catch (err) {
    console.error("[PLAYBOOKS POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
