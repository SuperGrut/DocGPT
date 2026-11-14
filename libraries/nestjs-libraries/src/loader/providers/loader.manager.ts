import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import {
  DocumentLoader,
  LOADER_METADATA,
  LoaderRegistration,
} from "@docgpt/nestjs-libraries/loader/loader.interface";
import { UnsupportedFileTypeError } from "@docgpt/nestjs-libraries/loader/loader.utils";

@Injectable()
export class LoaderManager {
  constructor(private readonly _moduleRef: ModuleRef) {}

  forMime(mime: string): DocumentLoader {
    const found = this.registry().find((r) => r.mimeTypes.includes(mime));

    if (!found) {
      throw new UnsupportedFileTypeError(
        `No loader for '${mime}'. Supported: ${this.supportedMimes().join(", ") || "(none)"}`,
      );
    }

    return this._moduleRef.get(found.target, { strict: false });
  }

  /** Useful for rejecting unsupported uploads at requestUpload instead of at ingestion. */
  supportedMimes(): string[] {
    return this.registry().flatMap((r) => r.mimeTypes);
  }

  private registry(): LoaderRegistration[] {
    return Reflect.getMetadata(LOADER_METADATA, DocumentLoader) || [];
  }
}
