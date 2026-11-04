import { RetrievedChunk } from "./retrieval.interface";

export interface ContextCompressor {
  compress(input: {
    query: string;
    chunks: RetrievedChunk[];
    maxContextCharacters: number;
  }): Promise<RetrievedChunk[]>;
}
