/**
 * Extracts plain text from an uploaded policy document so it can be handed
 * to the AI compiler, which only ever sees text — PDF/DOCX parsing happens
 * once, up front, and has no bearing on the deterministic pipeline below it.
 */

export async function extractPolicyText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // .md, .txt, or anything else — treat as plain text.
  return file.text();
}
