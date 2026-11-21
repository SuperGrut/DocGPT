import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service"; // match your other repositories
import type { ChunkRecord } from "./retrieval.types";

/** Must match the text search configuration used by the generated `search` column. */
const FTS_CONFIG = "english";

export interface VectorHit {
  id: string;
  distance: number;
}
export interface KeywordHit {
  id: string;
  rank: number;
}

@Injectable()
export class RetrievalRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Documents the user owns and may search: ready, and inside the chat's scope if one is set. */
  async resolveDocumentIds(
    userId: string,
    scope?: string[],
  ): Promise<string[]> {
    const docs = await this.prisma.document.findMany({
      where: {
        userId,
        status: "READY",
        ...(scope?.length ? { id: { in: scope } } : {}),
      },
      select: { id: true },
    });
    return docs.map((d) => d.id);
  }

  async vectorSearch(p: {
    model: string;
    dimensions: number;
    vector: number[];
    documentIds: string[];
    limit: number;
    iterativeScan: boolean;
  }): Promise<VectorHit[]> {
    if (!Number.isInteger(p.dimensions) || p.dimensions <= 0) {
      throw new Error(`Invalid embedding dimensions: ${p.dimensions}`);
    }
    if (!/^[\w.:\-]+$/.test(p.model))
      throw new Error(`Invalid embedding model name: ${p.model}`);

    // dimensions and model are inlined, not bound. The partial HNSW index only matches a query whose
    // predicate is a literal (a bound parameter can fall back to a generic plan and a sequential scan).
    const dims = Prisma.raw(String(p.dimensions));
    const model = Prisma.raw(`'${p.model}'`);
    const literal = `[${p.vector.join(",")}]`;

    // Materialized CTE, then re-sort: iterative scans return rows only approximately ordered.
    const query = Prisma.sql`
      WITH hits AS MATERIALIZED (
        SELECT e."chunkId" AS id, (e.embedding::vector(${dims})) <=> ${literal}::vector AS distance
        FROM "ChunkEmbedding" e
        JOIN "DocumentChunk" c ON c.id = e."chunkId"
        WHERE e.model = ${model} AND c."documentId" = ANY(${p.documentIds}::text[])
        ORDER BY distance
        LIMIT ${p.limit}
      )
      SELECT id, distance FROM hits ORDER BY distance`;

    if (!p.iterativeScan) return this.prisma.$queryRaw<VectorHit[]>(query);

    // pgvector 0.8+: keep scanning the index until enough rows survive the document filter.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`;
      return tx.$queryRaw<VectorHit[]>(query);
    });
  }

  /**
   * Full-text search with OR semantics: a question has many words, and requiring all of them to
   * match (the default AND) would return almost nothing. Ranked by cover density.
   */
  keywordSearch(p: {
    query: string;
    documentIds: string[];
    limit: number;
  }): Promise<KeywordHit[]> {
    return this.prisma.$queryRaw<KeywordHit[]>`
      WITH q AS (
        SELECT replace(plainto_tsquery(${FTS_CONFIG}::regconfig, ${p.query})::text, '&', '|')::tsquery AS tsq
      )
      SELECT c.id, ts_rank_cd(c.search, q.tsq) AS rank
      FROM "DocumentChunk" c CROSS JOIN q
      WHERE c."documentId" = ANY(${p.documentIds}::text[]) AND c.search @@ q.tsq
      ORDER BY rank DESC
      LIMIT ${p.limit}`;
  }

  async getChunks(ids: string[]): Promise<ChunkRecord[]> {
    const rows = await this.prisma.documentChunk.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        documentId: true,
        index: true,
        text: true,
        context: true,
        pageStart: true,
        pageEnd: true,
        document: { select: { fileName: true } },
      },
    });
    return rows.map(({ document, ...rest }) => ({
      ...rest,
      fileName: document.fileName,
    }));
  }
}
