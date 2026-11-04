import { Module } from "@nestjs/common";

import { ChunkerRegistry } from "./chunker.registry";
import { ChunkingService } from "./chunking.service";

import { FixedSizeChunker } from "./strategies/fixed-size.chunker";
import { RecursiveChunker } from "./strategies/recursive.chunker";
import { LlmChunker } from "./strategies/llm.chunker";

import { SEMANTIC_BOUNDARY_DETECTOR } from "./strategies/llm.chunker";

@Module({
  providers: [
    FixedSizeChunker,
    RecursiveChunker,
    LlmChunker,

    ChunkerRegistry,
    ChunkingService,

    // Register your actual LLM boundary detector here.
    // {
    //   provide: SEMANTIC_BOUNDARY_DETECTOR,
    //   useClass: OpenAiSemanticBoundaryDetector,
    // },
  ],
  exports: [ChunkingService],
})
export class ChunkerModule {}
