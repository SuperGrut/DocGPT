export interface RetrievalInput {
  query: string;
  userId: string;

  // Must be resolved by the backend after checking conversation access.
  documentIds: string[];

  embeddingModelId: string;
  dimensions: number;

  vectorTopK?: number;
  keywordTopK?: number;
  finalTopK?: number;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;

  // Search score for the relevant stage.
  score: number;

  // Optional diagnostics.
  vectorScore?: number;
  keywordScore?: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
}
