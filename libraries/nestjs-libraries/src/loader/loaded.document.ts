import type { DocumentSource } from "./document-source";

export interface LoadLimits {
  /** Largest file the loader will read. Enforced on the bytes that actually arrive, not on a declared size. */
  maxBytes: number;
  /** Lets the caller (for example a timeout) stop a load that is in progress. */
  signal?: AbortSignal;
}

export interface LoadedDocument {
  source: DocumentSource;
  bytes: Buffer;
  sizeBytes: number;
  /** Hex SHA-256, computed while the bytes were read. */
  sha256: string;
  /**
   * What the origin reported about the file. Informational only: the document's declared type
   * is what picks the parser.
   */
  contentType?: string;
}
