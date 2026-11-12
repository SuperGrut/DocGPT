import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";

import { StorageProvider } from "@docgpt/nestjs-libraries/storage/provider.interface";

/**
 * Holds every enabled adapter.
 *  - forWrite()    -> the adapter named by STORAGE_DRIVER, used for NEW files
 *  - forDocument() -> the adapter recorded on the document row, used for EXISTING files
 * Because the row remembers its adapter, you can change STORAGE_DRIVER (local -> s3, s3 -> r2)
 * and keep every old file readable by leaving the old driver in STORAGE_ENABLED_DRIVERS.
 */
@Injectable()
export class StorageManager implements OnModuleInit {
  constructor(
    private readonly _moduleRef: ModuleRef,
    private readonly _cfg: ConfigService,
  ) {}

  // Fail at boot, not on the first upload or read.
  onModuleInit() {
    for (const name of this.names()) {
      const provider = this.get(name);
      if (provider.name !== name) {
        throw new Error(
          `Storage adapter registered as '${name}' reports name '${provider.name}'`,
        );
      }
    }
    this.forWrite();
  }

  forWrite(): StorageProvider {
    return this.get(this._cfg.getOrThrow<string>("STORAGE_DRIVER"));
  }

  forDocument(document: { storageProvider: string }): StorageProvider {
    return this.get(document.storageProvider);
  }

  get(provider: string): StorageProvider {
    if (!this.names().includes(provider)) {
      throw new Error(
        `Storage '${provider}' is not enabled. Enabled: ${this.names().join(", ") || "(none)"}`,
      );
    }

    const metadata =
      Reflect.getMetadata("storage-provider", StorageProvider) || [];

    const found = metadata.find((m: any) => m.provider === provider);

    if (!found) {
      throw new Error(`Storage provider '${provider}' is not registered`);
    }

    return this._moduleRef.get(found.target, { strict: false });
  }

  names(): string[] {
    const raw = this._cfg.get<string>("STORAGE_ENABLED_DRIVERS") ?? "";
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const writer = this._cfg.get<string>("STORAGE_DRIVER");
    return writer && !list.includes(writer) ? [...list, writer] : list;
  }
}
