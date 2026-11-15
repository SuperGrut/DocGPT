import { Module } from "@nestjs/common";

import { TokenCounter } from "@docgpt/nestjs-libraries/chunker/chunker.interface";
import { ChunkerService } from "@docgpt/nestjs-libraries/chunker/chunker.service";
import { FixedChunker } from "@docgpt/nestjs-libraries/chunker/providers/fixed.chunker.provider";
import { ChunkerManager } from "@docgpt/nestjs-libraries/chunker/providers/chunker.manager";
import { RecursiveChunker } from "@docgpt/nestjs-libraries/chunker/providers/recursive.chunker.provider";
import { ApproxTokenCounter } from "@docgpt/nestjs-libraries/chunker/token.counter";

// Assumes PrismaService and ConfigService come from global modules, as in the loader module.
@Module({
  providers: [
    { provide: TokenCounter, useClass: ApproxTokenCounter },
    RecursiveChunker, // importing the classes is what runs their @Chunker decorators
    FixedChunker,
    ChunkerManager,
    ChunkerService,
  ],
  exports: [ChunkerService],
})
export class ChunkerModule {}
