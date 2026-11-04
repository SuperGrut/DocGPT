import { RetrievedChunk } from "./retrieval.interface";

export interface Reranker {
  rerank(input: {
    query: string;
    chunks: RetrievedChunk[];
    topK: number;
  }): Promise<RetrievedChunk[]>;
}
