import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import {
  RERANKER_METADATA,
  Reranker,
  RerankerRegistration,
} from "../reranker.interface";

@Injectable()
export class RerankerManager {
  constructor(private _moduleRef: ModuleRef) {}

  get(provider: string): Reranker {
    const found = this.registered().find((r) => r.provider === provider);
    if (!found) {
      throw new Error(
        `Reranker '${provider}' not found. Available: ${this.names().join(", ") || "(none)"}`,
      );
    }
    return this._moduleRef.get(found.target, { strict: false });
  }

  names(): string[] {
    return this.registered().map((r) => r.provider);
  }

  private registered(): RerankerRegistration[] {
    return Reflect.getMetadata(RERANKER_METADATA, Reranker) || [];
  }
}
