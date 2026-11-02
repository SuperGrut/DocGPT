import * as mammoth from "mammoth";

import type {
  DocumentParser,
  ParseOptions,
  ParsedDocument,
} from "../ports/parser.port";
import { ProcessingError } from "./parser.errors";
import { MAX_EXTRACTED_CHARS } from "./parser.utils";

// A .docx file is a ZIP archive: 'PK' followed by 0x03 0x04 (normal), 0x05 0x06 (empty) or 0x07 0x08 (spanned).
const isZip = (head: Buffer) =>
  head.length >= 4 &&
  head[0] === 0x50 &&
  head[1] === 0x4b &&
  [0x03, 0x05, 0x07].includes(head[2]);

// Old .doc files and password-encrypted .docx files are both OLE compound files.
const isOle = (head: Buffer) =>
  head.length >= 4 &&
  head[0] === 0xd0 &&
  head[1] === 0xcf &&
  head[2] === 0x11 &&
  head[3] === 0xe0;

/**
 * Word adapter built on mammoth. Plain text only: no tables, headings or images are kept.
 * DOCX has no fixed pages, so the whole text is returned as a single page without a pageNumber.
 * The chunker splits it, and the UI cites a snippet instead of a page.
 */
export class DocxParser implements DocumentParser {
  readonly id = "docx";
  readonly mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  // xlsx and pptx are ZIP files too, so this cannot prove the file is a Word document.
  // The declared MIME type narrows it down, and mammoth fails with CORRUPT if the content is not a Word file.
  sniff(head: Buffer): boolean {
    return isZip(head);
  }

  diagnose(head: Buffer): ProcessingError | null {
    return isOle(head)
      ? new ProcessingError(
          "LEGACY_OR_ENCRYPTED",
          "This is an old .doc file or a password-protected Word file. Save it as a normal .docx and upload it again.",
        )
      : null;
  }

  async parse(file: Buffer, opts: ParseOptions = {}): Promise<ParsedDocument> {
    if (opts.signal?.aborted)
      throw new ProcessingError("TIMEOUT", "Parsing was aborted");

    let raw: string;
    try {
      raw = (await mammoth.extractRawText({ buffer: file })).value;
    } catch {
      throw new ProcessingError(
        "CORRUPT",
        "The file is damaged or is not a valid .docx file",
      );
    }

    if (raw.length > MAX_EXTRACTED_CHARS) {
      throw new ProcessingError(
        "TOO_MUCH_TEXT",
        "The document contains too much text",
      );
    }
    const text = raw
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text)
      throw new ProcessingError("EMPTY", "The document contains no text");

    return { pages: [{ text }], metadata: {} };
  }
}
