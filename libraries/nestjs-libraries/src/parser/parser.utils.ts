import type { ParsedDocument } from "../ports/parser.port";
import { ProcessingError } from "./parser.errors";

/** Upper bound on extracted text per document. Protects the worker's memory from decompression bombs. */
export const MAX_EXTRACTED_CHARS = 5_000_000;

/**
 * Runs `run` with an AbortSignal and gives up after `ms`. On timeout the signal is aborted, which
 * well-behaved parsers check between pages. NOTE: this stops waiting, it cannot stop CPU-bound work that is
 * already running. For hostile input, also run parsing in a worker thread or child process (see README).
 */
export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new ProcessingError("TIMEOUT", `Parsing took longer than ${ms} ms`),
      );
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A PDF made of page images has no text layer, so extraction returns almost nothing.
 * Treat very little text per page as a scan. Raise the threshold if you see false positives.
 */
export function looksScanned(
  doc: ParsedDocument,
  minCharsPerPage = 25,
): boolean {
  const pageCount = doc.metadata.pageCount ?? doc.pages.length;
  if (pageCount === 0) return true;
  const chars = doc.pages.reduce(
    (sum, page) => sum + page.text.replace(/\s/g, "").length,
    0,
  );
  return chars / pageCount < minCharsPerPage;
}
