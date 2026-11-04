import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

import {
  RetrievalInput,
  RetrievedChunk,
} from "../interfaces/retrieval.interface";

const VECTOR_TABLES: Record<number, string> = {
  384: '"VectorEmbedding384"',
  768: '"VectorEmbedding768"',
  1536: '"VectorEmbedding1536"',
  3072: '"VectorEmbedding3072"',
};

@Injectable()
export class KeywordSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(input: RetrievalInput): Promise<RetrievedChunk[]> {
    if (!input.documentIds.length) {
      return [];
    }

    const table = VECTOR_TABLES[input.dimensions];

    if (!table) {
      throw new Error(`Unsupported embedding dimensions: ${input.dimensions}`);
    }

    const limit = input.keywordTopK ?? 20;

    const results = await this.prisma.$queryRaw<
      Array<{
        chunkId: string;
        documentId: string;
        content: string;
        metadata: Prisma.JsonValue;
        score: number;
      }>
    >`
      WITH search_query AS (
        SELECT websearch_to_tsquery(
          'english',
          ${input.query}
        ) AS query
      )
      SELECT
        v."chunkId",
        v."documentId",
        v."content",
        v."metadata",
        ts_rank_cd(
          v."searchVector",
          search_query.query
        ) AS score
      FROM ${Prisma.raw(table)} AS v
      CROSS JOIN search_query
      WHERE
        v."userId" = ${input.userId}
        AND v."embeddingModelId" = ${input.embeddingModelId}
        AND v."documentId" = ANY(
          ${input.documentIds}::text[]
        )
        AND v."searchVector" @@ search_query.query
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return results.map((result) => ({
      chunkId: result.chunkId,
      documentId: result.documentId,
      content: result.content,
      metadata: this.toMetadata(result.metadata),
      score: Number(result.score),
      keywordScore: Number(result.score),
    }));
  }

  private toMetadata(metadata: Prisma.JsonValue): Record<string, unknown> {
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      return metadata as Record<string, unknown>;
    }

    return {};
  }
}
