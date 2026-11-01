import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { STORAGE_PROVIDERS, StorageProvider } from "../ports/storage.port";

/**
 * Holds every enabled adapter.
 *  - forWrite()    -> the adapter named by STORAGE_DRIVER, used for NEW files
 *  - forDocument() -> the adapter recorded on the document row, used for EXISTING files
 * Because the row remembers its adapter, you can change STORAGE_DRIVER (local -> s3, s3 -> r2)
 * and keep every old file readable by leaving the old driver in STORAGE_ENABLED_DRIVERS.
 */
@Injectable()
export class StorageManager {
  private readonly byName = new Map<string, StorageProvider>();

  constructor(
    @Inject(STORAGE_PROVIDERS) providers: StorageProvider[],
    private readonly cfg: ConfigService,
  ) {
    for (const provider of providers) {
      if (this.byName.has(provider.name))
        throw new Error(`Duplicate storage provider '${provider.name}'`);
      this.byName.set(provider.name, provider);
    }
    // Fail at boot, not on the first upload, if STORAGE_DRIVER is not among the enabled adapters.
    this.forWrite();
  }

  forWrite(): StorageProvider {
    return this.get(this.cfg.getOrThrow<string>("STORAGE_DRIVER"));
  }

  forDocument(document: { storageProvider: string }): StorageProvider {
    return this.get(document.storageProvider);
  }

  get(name: string): StorageProvider {
    const provider = this.byName.get(name);
    if (!provider) {
      throw new Error(
        `Storage '${name}' is not enabled. Enabled: ${this.names().join(", ") || "(none)"}`,
      );
    }
    return provider;
  }

  names(): string[] {
    return [...this.byName.keys()];
  }
}
