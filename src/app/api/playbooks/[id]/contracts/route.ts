import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { extractTextFromBuffer, getFileTypeFromName } from "@/lib/parser";
import {
  requirePlaybook,
  playbookWhere,
  withPlaybookWrite,
  PlaybookError,
  playbookErrorResponse,
} from "@/lib/playbook-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const userId = session.user.id;
  try {
    const { id } = await params;
    await requirePlaybook(id, userId, true);
    const formData = await req.formData();
    const files = formData.getAll("files");
    if (!files.length || files.length > 5) {
      throw new PlaybookError(400, "Upload 1 to 5 files at a time.");
    }
    const data: {
      playbookId: string;
      name: string;
      fileType: string;
      rawText: string;
      status: "PROCESSED";
    }[] = [];
    for (const file of files) {
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > 5 * 1024 * 1024
      ) {
        throw new PlaybookError(
          400,
          "Each file must be non-empty and at most 5 MB.",
        );
      }
      const fileType = getFileTypeFromName(file.name);
      if (!["pdf", "docx", "txt"].includes(fileType)) {
        throw new PlaybookError(
          400,
          "Use PDF, DOCX or TXT files. Convert legacy DOC files first.",
        );
      }
      let rawText: string;
      try {
        rawText = await extractTextFromBuffer(
          Buffer.from(await file.arrayBuffer()),
          fileType,
        );
      } catch {
        throw new PlaybookError(
          400,
          "A file could not be read. Try a text-based PDF, DOCX or TXT file.",
        );
      }
      if (!rawText.trim()) {
        throw new PlaybookError(
          400,
          "A file has no readable text. Scanned PDFs need OCR before upload.",
        );
      }
      if (rawText.length > 500000) {
        throw new PlaybookError(
          400,
          "A file contains too much text. Split it before uploading.",
        );
      }
      data.push({
        playbookId: id,
        name: file.name.replace(/\.[^.]+$/, ""),
        fileType,
        rawText,
        status: "PROCESSED" as const,
      });
    }
    const contracts = await withPlaybookWrite(id, userId, async (tx) => {
      const created = [];
      for (const contract of data) {
        created.push(await tx.contract.create({ data: contract }));
      }
      await tx.playbook.update({ where: { id }, data: { status: "DRAFT" } });
      return created;
    });
    return NextResponse.json({ contracts }, { status: 201 });
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
    const contracts = await db.contract.findMany({
      where: { playbook: playbookWhere(id, session.user.id) },
      include: { _count: { select: { clauses: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ contracts });
  } catch (error) {
    return playbookErrorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const contractId = req.nextUrl.searchParams.get("contractId");
    if (!contractId) {
      throw new PlaybookError(400, "contractId required");
    }
    await withPlaybookWrite(id, session.user.id, async (tx) => {
      const deleted = await tx.contract.deleteMany({
        where: { id: contractId, playbookId: id },
      });
      if (!deleted.count) {
        throw new PlaybookError(404, "Contract not found in this playbook");
      }
      await tx.playbook.update({ where: { id }, data: { status: "DRAFT" } });
    });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    return playbookErrorResponse(error);
  }
}
