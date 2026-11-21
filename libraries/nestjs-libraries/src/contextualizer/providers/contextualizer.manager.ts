import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import {
  CONTEXTUALIZER_METADATA,
  ChunkContextualizer,
  ContextualizerRegistration,
} from "@docgpt/nestjs-libraries/contextualizer/contextualizer.interface";

@Injectable()
export class ContextualizerManager {
  constructor(private _moduleRef: ModuleRef) {}

  get(provider: string): ChunkContextualizer {
    const found = this.registered().find((r) => r.provider === provider);

    if (!found) {
      throw new Error(
        `Contextualizer provider '${provider}' not found. Available: ${this.names().join(", ") || "(none)"}`,
      );
    }

    return this._moduleRef.get(found.target, { strict: false });
  }

  names(): string[] {
    return this.registered().map((r) => r.provider);
  }

  private registered(): ContextualizerRegistration[] {
    return (
      Reflect.getMetadata(CONTEXTUALIZER_METADATA, ChunkContextualizer) || []
    );
  }
}
