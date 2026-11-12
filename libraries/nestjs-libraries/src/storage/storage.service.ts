import { Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";

import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  StorageObjectInfo,
  UploadTarget,
} from "@docgpt/nestjs-libraries/storage/provider.interface";
import { StorageManager } from "@docgpt/nestjs-libraries/storage/providers/providers.manager";

@Injectable()
export class FileStorageService {
  constructor(private readonly _storage: StorageManager) {}

  /** Name to store on the Document row for a new file. */
  getWriteProviderName(): string {
    return this._storage.forWrite().name;
  }

  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTarget> {
    return this._storage.forWrite().createUploadUrl(input);
  }

  stat(
    doc: { storageProvider: string },
    key: string,
  ): Promise<StorageObjectInfo | null> {
    return this._storage.forDocument(doc).stat(key);
  }

  getStream(doc: { storageProvider: string }, key: string): Promise<Readable> {
    return this._storage.forDocument(doc).getStream(key);
  }

  createDownloadUrl(
    doc: { storageProvider: string },
    key: string,
    input: CreateDownloadUrlInput,
  ): Promise<string> {
    return this._storage.forDocument(doc).createDownloadUrl(key, input);
  }

  delete(doc: { storageProvider: string }, key: string): Promise<void> {
    return this._storage.forDocument(doc).delete(key);
  }
}
