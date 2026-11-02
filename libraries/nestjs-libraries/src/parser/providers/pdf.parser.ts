// pdfjs-dist 3.x ships a CommonJS build under legacy/. Version 4 and later are ESM-only and cannot be
// require()d from a CommonJS Nest app, so keep this pinned to 3.11.174 until the app itself moves to ESM.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import type {
  TextItem,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";

import type {
  DocumentParser,
  ParseOptions,
  ParsedDocument,
  ParsedPage,
} from "../ports/parser.port";
import { ProcessingError } from "./parser.errors";
import { MAX_EXTRACTED_CHARS } from "./parser.utils";

const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

// Named, typed callbacks: an arrow function that only returns undefined or null gets an implicit
// `any` return type when strictNullChecks is off.
const ignore = (): void => undefined;
const noMetadata = (): null => null;

const isTextItem = (item: TextItem | TextMarkedContent): item is TextItem =>
  "str" in item;

/** pdf.js marks the end of each visual line with hasEOL, so lines survive into the extracted text. */
function itemsToText(items: Array<TextItem | TextMarkedContent>): string {
  let text = "";
  for (const item of items) {
    if (!isTextItem(item)) continue;
    text += item.str;
    if (item.hasEOL) text += "\n";
  }
  return text.trim();
}

function mapPdfError(e: unknown): ProcessingError {
  if (e instanceof ProcessingError) return e;
  const err = e as { name?: string; message?: string } | undefined;
  const name = String(err?.name ?? "");
  const message = String(err?.message ?? e);
  if (name === "PasswordException" || /password/i.test(message)) {
    return new ProcessingError(
      "PASSWORD_PROTECTED",
      "The PDF is password protected",
    );
  }
  if (
    name === "InvalidPDFException" ||
    name === "MissingPDFException" ||
    name === "FormatError" ||
    /invalid pdf|xref|unexpected end/i.test(message)
  ) {
    return new ProcessingError(
      "CORRUPT",
      "The file is damaged or is not a valid PDF",
    );
  }
  return new ProcessingError("UNKNOWN", message);
}

/**
 * PDF adapter built on pdf.js (pdfjs-dist, legacy CommonJS build), text extraction only.
 * To use another engine later (a newer pdf.js after an ESM migration, an OCR service...), write a second
 * class that implements DocumentParser and swap it in parser.module.ts. Nothing else changes.
 */
export class PdfParser implements DocumentParser {
  readonly id = "pdf";
  readonly mimeTypes = ["application/pdf"];

  sniff(head: Buffer): boolean {
    // The PDF spec allows the header anywhere in the first 1024 bytes.
    return head.subarray(0, 1024).toString("latin1").includes("%PDF-");
  }

  async parse(file: Buffer, opts: ParseOptions = {}): Promise<ParsedDocument> {
    const aborted = () => new ProcessingError("TIMEOUT", "Parsing was aborted");
    if (opts.signal?.aborted) throw aborted();

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(file), // a copy: pdf.js may detach the buffer it is given
      isEvalSupported: false, // never run code from inside a PDF
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    const onAbort = (): void => void loadingTask.destroy().catch(ignore);
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const doc = await loadingTask.promise;

      // Checked before any page is read, so an oversized document costs almost nothing.
      if (opts.maxPages && doc.numPages > opts.maxPages) {
        throw new ProcessingError(
          "TOO_MANY_PAGES",
          `The document has ${doc.numPages} pages (limit ${opts.maxPages})`,
        );
      }

      const pages: ParsedPage[] = [];
      let chars = 0;
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        if (opts.signal?.aborted) throw aborted();
        const page = await doc.getPage(pageNumber);
        const text = itemsToText((await page.getTextContent()).items);
        page.cleanup();

        chars += text.length;
        if (chars > MAX_EXTRACTED_CHARS) {
          throw new ProcessingError(
            "TOO_MUCH_TEXT",
            "The document contains too much text",
          );
        }
        pages.push({ pageNumber, text });
      }

      const info = ((await doc.getMetadata().catch(noMetadata))?.info ??
        {}) as Record<string, unknown>;
      return {
        pages,
        metadata: {
          pageCount: doc.numPages,
          title: asText(info.Title),
          author: asText(info.Author),
        },
      };
    } catch (e) {
      throw opts.signal?.aborted ? aborted() : mapPdfError(e);
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
      await loadingTask.destroy().catch(ignore);
    }
  }
}
