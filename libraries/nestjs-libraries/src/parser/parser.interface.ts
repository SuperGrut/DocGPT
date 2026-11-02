import type { ProcessingError } from "../parser/parser.errors";

/** DI token: the list of every enabled DocumentParser. */
export const DOCUMENT_PARSERS = Symbol("DOCUMENT_PARSERS");

export interface ParsedPage {
  /** 1-based. Undefined for formats without pages (DOCX): cite a snippet instead of a page. */
  pageNumber?: number;
  text: string;
}

export interface ParsedDocument {
  pages: ParsedPage[];
  metadata: {
    pageCount?: number;
    title?: string;
    author?: string;
  };
}

export interface ParseOptions {
  /** Parsers check this between units of work and stop early when it is aborted. */
  signal?: AbortSignal;
  /** Reject (TOO_MANY_PAGES) documents with more pages than this. */
  maxPages?: number;
}

/**
 * One implementation per file format. Registered in ParserRegistry by MIME type.
 * Adding Excel later = one new class that implements this, plus one line in parser.module.ts.
 */
export interface DocumentParser {
  /** Short stable id, stored on Document.parserId ('pdf', 'docx'). */
  readonly id: string;
  readonly mimeTypes: string[];
  /**
   * Magic-byte check on the first bytes of the file (pass at least 1024 bytes).
   * The declared MIME type comes from the client, so the worker verifies the real content too.
   */
  sniff(head: Buffer): boolean;
  /**
   * Optional: explain WHY sniff() failed (for example an old .doc file or an encrypted Word file),
   * so the user gets a useful failure code instead of a generic CORRUPT.
   */
  diagnose?(head: Buffer): ProcessingError | null;
  parse(file: Buffer, opts?: ParseOptions): Promise<ParsedDocument>;
}
