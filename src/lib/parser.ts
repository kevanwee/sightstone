/**
 * Contract text extraction utilities
 * Supports: PDF, DOCX, TXT
 */

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  const type = fileType.toLowerCase();

  if (type === "pdf" || type === "application/pdf") {
    return extractFromPdf(buffer);
  }

  if (
    type === "docx" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractFromDocx(buffer);
  }

  if (type === "txt" || type === "text/plain") {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  // Dynamically import to avoid SSR issues
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export function getFileTypeFromName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "pdf",
    docx: "docx",
    doc: "docx",
    txt: "txt",
  };
  return map[ext] ?? ext;
}

export function isAcceptedFileType(fileType: string): boolean {
  return ["pdf", "docx", "doc", "txt"].includes(
    getFileTypeFromName(fileType.replace(".", ""))
  );
}
