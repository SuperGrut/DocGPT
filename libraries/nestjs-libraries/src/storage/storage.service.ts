import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StorageProvider } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { StorageProviderRegistry } from "@docgpt/nestjs-libraries/storage/storage.provider.registry";
import { StoredFile } from "@docgpt/nestjs-libraries/storage/storage.provider.interface";

@Injectable()
export class FileStorageService {
  constructor(
    private readonly registry: StorageProviderRegistry,
    private readonly config: ConfigService,
  ) {}

  getDefaultProvider(): StorageProvider {
    const value =
      this.config.get<string>("DEFAULT_STORAGE_PROVIDER") ?? "LOCAL";

    if (!Object.values(StorageProvider).includes(value as StorageProvider)) {
      throw new Error(`Invalid default storage provider: ${value}`);
    }

    return value as StorageProvider;
  }

  async upload(
    provider: StorageProvider,
    ownerId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredFile> {
    const key = `${ownerId}/${randomUUID()}`;

    return this.registry.get(provider).upload({
      key,
      buffer,
      contentType,
    });
  }

  async download(provider: StorageProvider, key: string): Promise<Buffer> {
    return this.registry.get(provider).download(key);
  }

  async delete(provider: StorageProvider, key: string): Promise<void> {
    return this.registry.get(provider).delete(key);
  }
}
