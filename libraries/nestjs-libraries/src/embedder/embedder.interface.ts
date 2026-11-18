import { Injectable } from "@nestjs/common";

export class EmbedderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbedderError";
  }
}

/** HTTP/network failure. `retryable` is true for 429, 5xx and network errors. */
export class EmbeddingRequestError extends EmbedderError {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "EmbeddingRequestError";
  }
}

export abstract class EmbeddingProvider {
  /** Registry name, for example "openai". */
  abstract readonly name: string;
  /** Stored with every vector. Vectors from different models are not comparable. */
  abstract readonly model: string;
  abstract readonly dimensions: number;
  abstract readonly maxInputTokens: number;
  abstract readonly maxBatchSize: number;

  abstract embedDocuments(texts: string[]): Promise<number[][]>;
  /** Separate from embedDocuments because some models want a different prefix for queries. */
  abstract embedQuery(text: string): Promise<number[]>;

  /** Called at boot for the selected provider. Throw if its config is missing. */
  validate(): void {}
}

export interface EmbedderRegistration {
  target: any;
  provider: string;
}

export const EMBEDDER_METADATA = "embedding-provider";

export function Embedder(params: { provider: string }) {
  return function (target: any) {
    Injectable()(target);

    const existing: EmbedderRegistration[] =
      Reflect.getMetadata(EMBEDDER_METADATA, EmbeddingProvider) || [];

    if (existing.some((r) => r.provider === params.provider)) {
      throw new Error(`Duplicate embedding provider '${params.provider}'`);
    }

    existing.push({ target, provider: params.provider });

    Reflect.defineMetadata(EMBEDDER_METADATA, existing, EmbeddingProvider);
  };
}
