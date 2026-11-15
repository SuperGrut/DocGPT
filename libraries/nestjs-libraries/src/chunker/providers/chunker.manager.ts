import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import {
  CHUNKER_METADATA,
  ChunkerRegistration,
  DocumentChunker,
} from "@docgpt/nestjs-libraries/chunker/chunker.interface";

@Injectable()
export class ChunkerManager {
  constructor(private _moduleRef: ModuleRef) {}

  get(strategy: string): DocumentChunker {
    const registered = this.registered();
    const found = registered.find((r) => r.strategy === strategy);

    if (!found) {
      throw new Error(
        `Chunker strategy '${strategy}' not found. Available: ${this.strategies().join(", ") || "(none)"}`,
      );
    }

    return this._moduleRef.get(found.target, { strict: false });
  }

  strategies(): string[] {
    return this.registered().map((r) => r.strategy);
  }

  private registered(): ChunkerRegistration[] {
    return Reflect.getMetadata(CHUNKER_METADATA, DocumentChunker) || [];
  }
}
