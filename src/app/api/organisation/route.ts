import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// ─── GET /api/organisation  (current user's primary org + members) ────────────
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const membership = await db.organisationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organisation: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  if (!membership) return NextResponse.json({ error: "No organisation" }, { status: 404 });

  return NextResponse.json({
    organisation: membership.organisation,
    role: membership.role,
  });
}

// ─── PATCH /api/organisation  (update org name) ───────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const membership = await db.organisationMember.findFirst({
    where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
    include: { organisation: true },
  });

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const org = await db.organisation.update({
    where: { id: membership.organisationId },
    data: { ...(body.name && { name: body.name }) },
  });

  return NextResponse.json({ organisation: org });
}
