import { Injectable } from "@nestjs/common";
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

export abstract class StorageProvider {
  abstract readonly name: string;
  abstract createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTarget>;
  abstract stat(key: string): Promise<StorageObjectInfo | null>;
  abstract getStream(key: string): Promise<Readable>;
  abstract createDownloadUrl(
    key: string,
    input: CreateDownloadUrlInput,
  ): Promise<string>;
  abstract delete(key: string): Promise<void>;
}

export function StorageAdapter(params: { provider: string }) {
  return function (target: any) {
    Injectable()(target);

    const existingMetadata =
      Reflect.getMetadata("storage-provider", StorageProvider) || [];

    existingMetadata.push({ target, provider: params.provider });

    Reflect.defineMetadata(
      "storage-provider",
      existingMetadata,
      StorageProvider,
    );
  };
}
