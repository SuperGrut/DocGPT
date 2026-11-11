import { Injectable, NotFoundException } from "@nestjs/common";

import { Chunker, ChunkingStrategy } from "@docgpt/nestjs-libraries/chunker/chunker.interface";

import { FixedSizeChunker } from "@docgpt/nestjs-libraries/chunker/strategies/fixed.size.chunker";
import { RecursiveChunker } from "./strategies/recursive.chunker";
import { LlmChunker } from "./strategies/llm.chunker";

@Injectable()
export class ChunkerRegistry {
  private readonly chunkers: Map<ChunkingStrategy, Chunker>;

  constructor(
    fixedSizeChunker: FixedSizeChunker,
    recursiveChunker: RecursiveChunker,
    llmChunker: LlmChunker,
  ) {
    this.chunkers = new Map([
      ["FIXED_SIZE", fixedSizeChunker],
      ["RECURSIVE", recursiveChunker],
      ["LLM", llmChunker],
    ]);
  }

  get(strategy: ChunkingStrategy): Chunker {
    const chunker = this.chunkers.get(strategy);

    if (!chunker) {
      throw new NotFoundException(
        `Chunking strategy ${strategy} is not registered`,
      );
    }

    return chunker;
  }
}
