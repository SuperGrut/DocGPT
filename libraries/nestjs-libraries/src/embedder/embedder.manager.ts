import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import {
  EMBEDDER_METADATA,
  EmbedderRegistration,
  EmbeddingProvider,
} from "../embedder.interface";

@Injectable()
export class EmbedderManager {
  constructor(private _moduleRef: ModuleRef) {}

  get(provider: string): EmbeddingProvider {
    const found = this.registered().find((r) => r.provider === provider);

    if (!found) {
      throw new Error(
        `Embedding provider '${provider}' not found. Available: ${this.names().join(", ") || "(none)"}`,
      );
    }

    return this._moduleRef.get(found.target, { strict: false });
  }

  names(): string[] {
    return this.registered().map((r) => r.provider);
  }

  private registered(): EmbedderRegistration[] {
    return Reflect.getMetadata(EMBEDDER_METADATA, EmbeddingProvider) || [];
  }
}
