import { Module } from "@nestjs/common";

import { EmbedderModule } from "../embedder/embedder.module";
import { VectorStoreModule } from "../vector-store/vector-store.module";
import { PrismaModule } from "../../prisma/prisma.module";

import { RetrievalService } from "./retrieval.service";

import { VectorSearchService } from "./search/vector-search.service";
import { KeywordSearchService } from "./search/keyword-search.service";
import { HybridSearchService } from "./search/hybrid-search.service";

import { IdentityReranker } from "./reranking/identity.reranker";
import { RerankingService } from "./reranking/reranking.service";

import { PassthroughCompressor } from "./compression/passthrough.compressor";
import { ContextCompressionService } from "./compression/context-compression.service";

import { Reranker } from "./interfaces/reranker.interface";
import { ContextCompressor } from "./interfaces/context-compressor.interface";

@Module({
  imports: [PrismaModule, EmbedderModule, VectorStoreModule],
  providers: [
    VectorSearchService,
    KeywordSearchService,
    HybridSearchService,

    IdentityReranker,
    {
      provide: Reranker,
      useExisting: IdentityReranker,
    },
    RerankingService,

    PassthroughCompressor,
    {
      provide: ContextCompressor,
      useExisting: PassthroughCompressor,
    },
    ContextCompressionService,

    RetrievalService,
  ],
  exports: [RetrievalService],
})
export class RetrievalModule {}
