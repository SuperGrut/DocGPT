import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { PrismaModule } from "../../prisma/prisma.module";

import { PgVectorStore } from "./providers/pgvector.store";
import { VectorStoreRegistry } from "./vector-store.registry";
import { VectorStorageService } from "./vector-storage.service";

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [PgVectorStore, VectorStoreRegistry, VectorStorageService],
  exports: [VectorStorageService],
})
export class VectorStoreModule {}
