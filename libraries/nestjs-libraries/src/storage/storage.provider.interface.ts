import type { Readable } from "node:stream";

/** DI token: the list of every enabled StorageProvider adapter. */
export const STORAGE_PROVIDERS = Symbol("STORAGE_PROVIDERS");

export interface CreateUploadUrlInput {
  /** Object key. Build it with buildDocumentKey(); never from a client file name. */
  key: string;
  contentType: string;
  /**
   * Size the client declared. Uploads larger than this MUST be rejected.
   * S3-compatible adapters sign it as Content-Length, so the upload has to match exactly.
   * The local adapter accepts anything up to this value.
   * DocumentService.completeUpload() re-checks the real size with stat() either way.
   */
  maxBytes: number;
  expiresInSec: number;
}

export interface UploadTarget {
  url: string;
  method: "PUT" | "POST";
  /** Headers the browser must send with the upload. */
  headers?: Record<string, string>;
  /** Extra form fields for POST-style uploads (none of the bundled adapters need this). */
  fields?: Record<string, string>;
}

export interface StorageObjectInfo {
  sizeBytes: number;
  contentType?: string;
}

export interface CreateDownloadUrlInput {
  expiresInSec: number;
  /** Shown to the user as the download name (sent as Content-Disposition). */
  fileName?: string;
}

/**
 * The only thing DocumentService and the worker know about file storage.
 * Contract (verified by describeStorageContract in testing/storage.contract.ts):
 *  - keys are validated with assertValidStorageKey(); bad keys throw InvalidStorageKeyError
 *  - stat() returns null for a missing object, it never throws for "not found"
 *  - getStream() throws StorageNotFoundError for a missing object
 *  - delete() is idempotent: deleting a missing object does not throw
 *  - an upload larger than maxBytes, or sent after expiresInSec, is rejected
 */
export interface StorageProviderInterface {
  /** Stored on every Document row (storageProvider), so reads can find the right adapter later. */
  readonly name: string;
  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTarget>;
  stat(key: string): Promise<StorageObjectInfo | null>;
  getStream(key: string): Promise<Readable>;
  createDownloadUrl(
    key: string,
    input: CreateDownloadUrlInput,
  ): Promise<string>;
  delete(key: string): Promise<void>;
}

export class StorageNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Storage object not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}
