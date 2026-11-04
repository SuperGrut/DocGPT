import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

import {
  DeleteVectorsInput,
  VectorRecord,
  VectorSearchInput,
  VectorSearchResult,
  VectorStore,
} from "../interfaces/vector-store.interface";

const VECTOR_TABLES = {
  384: '"VectorEmbedding384"',
  768: '"VectorEmbedding768"',
  1536: '"VectorEmbedding1536"',
  3072: '"VectorEmbedding3072"',
} as const;

type SupportedDimensions = keyof typeof VECTOR_TABLES;

@Injectable()
export class PgVectorStore implements VectorStore {
  readonly name = "PGVECTOR";

  private readonly batchSize = 100;

  constructor(private readonly prisma: PrismaService) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const dimensions = records[0].embedding.length;
    const table = this.getTable(dimensions);

    this.validateRecords(records, dimensions);

    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);

      await this.prisma.$transaction(async (tx) => {
        for (const record of batch) {
          const vector = `[${record.embedding.join(",")}]`;

          await tx.$executeRaw`
            INSERT INTO ${Prisma.raw(table)} (
              id,
              "chunkId",
              "documentId",
              "userId",
              "organizationId",
              "embeddingModelId",
              content,
              metadata,
              embedding,
              "createdAt",
              "updatedAt"
            )
            VALUES (
              ${record.id},
              ${record.chunkId},
              ${record.documentId},
              ${record.userId},
              ${record.organizationId ?? null},
              ${record.embeddingModelId},
              ${record.content},
              ${JSON.stringify(record.metadata)}::jsonb,
              ${vector}::vector,
              NOW(),
              NOW()
            )
            ON CONFLICT ("chunkId", "embeddingModelId")
            DO UPDATE SET
              "documentId" = EXCLUDED."documentId",
              "userId" = EXCLUDED."userId",
              "organizationId" = EXCLUDED."organizationId",
              content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              embedding = EXCLUDED.embedding,
              "updatedAt" = NOW()
          `;
        }
      });
    }
  }

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    this.validateSearchInput(input);

    const table = this.getTable(input.dimensions);
    const vector = `[${input.queryEmbedding.join(",")}]`;

    const documentFilter = input.documentIds?.length
      ? Prisma.sql`AND "documentId" = ANY(${input.documentIds}::text[])`
      : Prisma.empty;

    const organizationFilter = input.organizationId
      ? Prisma.sql`AND "organizationId" = ${input.organizationId}`
      : Prisma.empty;

    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        chunkId: string;
        documentId: string;
        content: string;
        metadata: Prisma.JsonValue;
        distance: number;
      }>
    >`
      SELECT
        id,
        "chunkId",
        "documentId",
        content,
        metadata,
        (embedding <=> ${vector}::vector) AS distance
      FROM ${Prisma.raw(table)}
      WHERE
        "userId" = ${input.userId}
        AND "embeddingModelId" = ${input.embeddingModelId}
        ${organizationFilter}
        ${documentFilter}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${input.topK}
    `;

    return results.map((row) => ({
      id: row.id,
      chunkId: row.chunkId,
      documentId: row.documentId,
      content: row.content,
      score: 1 - Number(row.distance),
      metadata: this.toMetadata(row.metadata),
    }));
  }

  async deleteByDocument(input: DeleteVectorsInput): Promise<void> {
    if (!input.documentId?.trim()) {
      throw new BadRequestException("Document ID is required");
    }

    const tables = Object.values(VECTOR_TABLES);

    await this.prisma.$transaction(
      tables.map((table) => {
        if (input.embeddingModelId) {
          return this.prisma.$executeRaw`
            DELETE FROM ${Prisma.raw(table)}
            WHERE
              "documentId" = ${input.documentId}
              AND "embeddingModelId" = ${input.embeddingModelId}
          `;
        }

        return this.prisma.$executeRaw`
          DELETE FROM ${Prisma.raw(table)}
          WHERE "documentId" = ${input.documentId}
        `;
      }),
    );
  }

  private getTable(dimensions: number): string {
    if (!(dimensions in VECTOR_TABLES)) {
      throw new BadRequestException(
        `Unsupported embedding dimensions: ${dimensions}`,
      );
    }

    return VECTOR_TABLES[dimensions as SupportedDimensions];
  }

  private validateRecords(
    records: VectorRecord[],
    expectedDimensions: number,
  ): void {
    for (const record of records) {
      if (
        !record.id ||
        !record.chunkId ||
        !record.documentId ||
        !record.userId ||
        !record.embeddingModelId ||
        !record.content
      ) {
        throw new BadRequestException(
          "Vector record is missing required fields",
        );
      }

      this.validateVector(record.embedding, expectedDimensions);
    }

    const uniqueKeys = new Set(
      records.map((record) => `${record.chunkId}:${record.embeddingModelId}`),
    );

    if (uniqueKeys.size !== records.length) {
      throw new BadRequestException(
        "Duplicate chunk/model pairs in the same upsert batch",
      );
    }
  }

  private validateSearchInput(input: VectorSearchInput): void {
    if (!input.userId?.trim()) {
      throw new BadRequestException("User ID is required");
    }

    if (!input.embeddingModelId?.trim()) {
      throw new BadRequestException("Embedding model ID is required");
    }

    if (!Number.isInteger(input.topK) || input.topK < 1 || input.topK > 100) {
      throw new BadRequestException("topK must be between 1 and 100");
    }

    if (input.documentIds && input.documentIds.some((id) => !id.trim())) {
      throw new BadRequestException("Invalid document ID filter");
    }

    this.validateVector(input.queryEmbedding, input.dimensions);
  }

  private validateVector(vector: number[], dimensions: number): void {
    this.getTable(dimensions);

    if (
      !Array.isArray(vector) ||
      vector.length !== dimensions ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new BadRequestException(
        `Embedding must contain exactly ${dimensions} finite numbers`,
      );
    }
  }

  private toMetadata(value: Prisma.JsonValue): Record<string, unknown> {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }
}
