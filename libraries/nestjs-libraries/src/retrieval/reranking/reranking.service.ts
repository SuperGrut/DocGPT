import { Injectable } from "@nestjs/common";

import { Reranker } from "../interfaces/reranker.interface";
import { RetrievedChunk } from "../interfaces/retrieval.interface";

@Injectable()
export class RerankingService {
  constructor(private readonly reranker: Reranker) {}

  async rerank(
    query: string,
    chunks: RetrievedChunk[],
    topK: number,
  ): Promise<RetrievedChunk[]> {
    return this.reranker.rerank({
      query,
      chunks,
      topK,
    });
  }
}
