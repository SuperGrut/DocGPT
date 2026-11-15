import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { LoadedDocument } from "@docgpt/nestjs-libraries/loader/loader.interface";
import { PrismaService } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import { ChunkerError } from "@docgpt/nestjs-libraries/chunker/chunker.interface";
import { ChunkerManager } from "@docgpt/nestjs-libraries/chunker/providers/chunker.manager";

const INSERT_BATCH = 500; // keeps each INSERT under Postgres' bind-parameter limit

@Injectable()
export class ChunkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: ChunkerManager,
    private readonly config: ConfigService,
  ) {}

  async chunk(documentId: string) {
    const parse = await this.prisma.documentParse.findUnique({
      where: { documentId },
    });
    if (!parse) {
      throw new ChunkerError(
        `No parsed output for document ${documentId}; run the loader first`,
      );
    }

    const loaded = parse.data as unknown as LoadedDocument;
    if (!Array.isArray(loaded?.blocks)) {
      throw new ChunkerError(`Parsed output for ${documentId} has no blocks`);
    }

    const strategy = this.config.get<string>("CHUNKER_STRATEGY") ?? "recursive";
    const maxTokens = Number(this.config.get("CHUNK_MAX_TOKENS") ?? 512);
    const overlapTokens = Number(this.config.get("CHUNK_OVERLAP_TOKENS") ?? 64);

    const result = this.manager.get(strategy).chunk({
      documentId,
      blocks: loaded.blocks,
      maxTokens,
      overlapTokens,
    });

    const rows = result.chunks.map((c) => ({
      id: c.id,
      documentId,
      index: c.index,
      text: c.text,
      tokenCount: c.tokenCount,
      pageStart: c.pageStart ?? null,
      pageEnd: c.pageEnd ?? null,
      sourceBlocks: c.sourceBlocks,
      chunkerName: result.chunkerName,
      chunkerVersion: result.chunkerVersion,
    }));

    // Replace, don't upsert: a re-chunk may produce fewer chunks, and stale ones must go.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId } });
        for (let i = 0; i < rows.length; i += INSERT_BATCH) {
          await tx.documentChunk.createMany({
            data: rows.slice(i, i + INSERT_BATCH),
          });
        }
      },
      { timeout: 30_000 },
    );

    // Return a reference only: the next activity reads DocumentChunk by documentId.
    return {
      documentId,
      chunkCount: rows.length,
      chunkerVersion: result.chunkerVersion,
    };
  }
}
