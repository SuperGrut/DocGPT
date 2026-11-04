import { Injectable } from "@nestjs/common";

import { Reranker } from "../interfaces/reranker.interface";
import { RetrievedChunk } from "../interfaces/retrieval.interface";

@Injectable()
export class IdentityReranker implements Reranker {
  async rerank(input: {
    query: string;
    chunks: RetrievedChunk[];
    topK: number;
  }): Promise<RetrievedChunk[]> {
    return input.chunks.slice(0, input.topK);
  }
}
