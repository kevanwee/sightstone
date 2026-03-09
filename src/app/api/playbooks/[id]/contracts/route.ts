import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { extractTextFromBuffer, getFileTypeFromName } from "@/lib/parser";

// ─── POST /api/playbooks/[id]/contracts  (upload one or more contracts) ───────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playbookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Verify playbook belongs to user's org
  const playbook = await db.playbook.findUnique({
    where: { id: playbookId },
    include: { organisation: { include: { members: { where: { userId: session.user.id } } } } },
  });

  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  if (!playbook.organisation.members.length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const created = [];

    for (const file of files) {
      const fileType = getFileTypeFromName(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());

      // Extract raw text
      let rawText = "";
      try {
        rawText = await extractTextFromBuffer(buffer, fileType);
      } catch (parseErr) {
        console.warn(`Failed to parse ${file.name}:`, parseErr);
        rawText = "";
      }

      const contract = await db.contract.create({
        data: {
          playbookId,
          name: file.name.replace(/\.[^.]+$/, ""), // strip extension
          fileType,
          rawText,
          status: rawText ? "PROCESSED" : "ERROR",
        },
      });

      created.push(contract);
    }

    return NextResponse.json({ contracts: created }, { status: 201 });
  } catch (err) {
    console.error("[CONTRACTS POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── GET /api/playbooks/[id]/contracts ───────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playbookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const contracts = await db.contract.findMany({
    where: { playbookId },
    include: { _count: { select: { clauses: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ contracts });
}

// ─── DELETE /api/playbooks/[id]/contracts?contractId=xxx ──────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const contractId = req.nextUrl.searchParams.get("contractId");
  if (!contractId) return NextResponse.json({ error: "contractId required" }, { status: 400 });

  await db.contract.delete({ where: { id: contractId } });
  return NextResponse.json({ message: "Deleted" });
}
