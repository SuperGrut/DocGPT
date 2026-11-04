import { BadRequestException, Injectable } from "@nestjs/common";

import {
  RetrievalInput,
  RetrievalResult,
} from "./interfaces/retrieval.interface";

import { HybridSearchService } from "./search/hybrid-search.service";
import { RerankingService } from "./reranking/reranking.service";
import { ContextCompressionService } from "./compression/context-compression.service";

@Injectable()
export class RetrievalService {
  constructor(
    private readonly hybridSearch: HybridSearchService,
    private readonly reranking: RerankingService,
    private readonly compression: ContextCompressionService,
  ) {}

  async retrieve(input: RetrievalInput): Promise<RetrievalResult> {
    if (!input.query.trim()) {
      throw new BadRequestException("Query cannot be empty");
    }

    if (!input.documentIds.length) {
      return { chunks: [] };
    }

    // 1. Semantic + keyword search.
    const candidates = await this.hybridSearch.search(input);

    if (!candidates.length) {
      return { chunks: [] };
    }

    // 2. Rerank candidates.
    const reranked = await this.reranking.rerank(
      input.query,
      candidates,
      input.finalTopK ?? 8,
    );

    // 3. Prepare context for the LLM.
    const compressed = await this.compression.compress(
      input.query,
      reranked,
      12000,
    );

    return {
      chunks: compressed,
    };
  }
}
