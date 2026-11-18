import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service"; // match the loader/chunker import
import { VectorRow, VectorStore } from "./vector-store.port";

@Injectable()
export class PgVectorStore extends VectorStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(rows: VectorRow[]): Promise<void> {
    if (!rows.length) return;

    const values = rows.map(
      (r) =>
        Prisma.sql`(${r.chunkId}, ${r.model}, ${r.vector.length}::int, ${`[${r.vector.join(",")}]`}::vector)`,
    );

    await this.prisma.$executeRaw`
      INSERT INTO "ChunkEmbedding" ("chunkId", "model", "dimensions", "embedding")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("chunkId", "model") DO UPDATE
      SET "embedding" = EXCLUDED."embedding", "dimensions" = EXCLUDED."dimensions"`;
  }
}
