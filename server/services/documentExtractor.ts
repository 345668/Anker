import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfParse from "pdf-parse";

const SUPPORTED_MIME_TYPES = {
  pdf: ["application/pdf"],
  word: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ],
  excel: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
  ],
};

export function isSupportedDocumentType(mimeType: string): boolean {
  const allTypes = [
    ...SUPPORTED_MIME_TYPES.pdf,
    ...SUPPORTED_MIME_TYPES.word,
    ...SUPPORTED_MIME_TYPES.excel,
  ];
  return allTypes.includes(mimeType);
}

export function getDocumentCategory(mimeType: string): "pdf" | "word" | "excel" | null {
  if (SUPPORTED_MIME_TYPES.pdf.includes(mimeType)) return "pdf";
  if (SUPPORTED_MIME_TYPES.word.includes(mimeType)) return "word";
  if (SUPPORTED_MIME_TYPES.excel.includes(mimeType)) return "excel";
  return null;
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const category = getDocumentCategory(mimeType);

  switch (category) {
    case "pdf":
      return extractTextFromPDF(buffer);
    case "word":
      return extractTextFromWord(buffer);
    case "excel":
      return extractTextFromExcel(buffer);
    default:
      throw new Error(`Unsupported document type: ${mimeType}`);
  }
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim();
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error("Failed to extract text from PDF");
  }
}

async function extractTextFromWord(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error("Word extraction error:", error);
    throw new Error("Failed to extract text from Word document");
  }
}

function extractTextFromExcel(buffer: Buffer): string {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    let fullText = "";

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      fullText += `\n--- Sheet: ${sheetName} ---\n${csv}`;
    }

    return fullText.trim();
  } catch (error) {
    console.error("Excel extraction error:", error);
    throw new Error("Failed to extract text from Excel document");
  }
}

export function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
  };
  
  return mimeTypes[ext || ""] || "application/octet-stream";
}

export function getSupportedExtensions(): string[] {
  return ["pdf", "doc", "docx", "xls", "xlsx", "csv"];
}
