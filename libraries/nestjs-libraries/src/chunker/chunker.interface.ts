import { Injectable } from "@nestjs/common";

import type { Block } from "@docgpt/nestjs-libraries/loader/loader.interface";

export class ChunkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChunkerError";
  }
}

export interface ChunkerInput {
  documentId: string;
  blocks: Block[];
  maxTokens: number;
  /** Must be smaller than maxTokens. 0 disables overlap. */
  overlapTokens: number;
}

export interface Chunk {
  /** sha256(documentId, chunkerVersion, index, text). Stable across retries. */
  id: string;
  index: number;
  text: string;
  tokenCount: number;
  pageStart?: number;
  pageEnd?: number;
  /** Block.order values this chunk was built from. */
  sourceBlocks: number[];
}

export interface ChunkedDocument {
  chunks: Chunk[];
  chunkerName: string;
  chunkerVersion: string;
}

/** DI token and contract for counting tokens. Bind an implementation that matches the embedding model. */
export abstract class TokenCounter {
  abstract count(text: string): number;
}

export abstract class DocumentChunker {
  /** Stable identifier, recorded with every chunk. */
  abstract readonly name: string;
  /** Bump whenever chunk output changes, so stale documents can be re-chunked. */
  abstract readonly version: string;
  abstract chunk(input: ChunkerInput): ChunkedDocument;
}

export interface ChunkerRegistration {
  target: any;
  strategy: string;
}

export const CHUNKER_METADATA = "document-chunker";

export function Chunker(params: { strategy: string }) {
  return function (target: any) {
    Injectable()(target);

    const existing: ChunkerRegistration[] =
      Reflect.getMetadata(CHUNKER_METADATA, DocumentChunker) || [];

    if (existing.some((r) => r.strategy === params.strategy)) {
      throw new Error(`Duplicate chunker strategy '${params.strategy}'`);
    }

    existing.push({ target, strategy: params.strategy });

    Reflect.defineMetadata(CHUNKER_METADATA, existing, DocumentChunker);
  };
}
