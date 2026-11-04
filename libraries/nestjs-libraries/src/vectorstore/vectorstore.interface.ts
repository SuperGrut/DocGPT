export interface VectorRecord {
  id: string;
  chunkId: string;
  documentId: string;

  userId: string;
  organizationId?: string;

  embeddingModelId: string;
  embedding: number[];

  content: string;

  metadata: Record<string, unknown>;
}

export interface VectorSearchInput {
  queryEmbedding: number[];

  userId: string;
  organizationId?: string;

  documentIds?: string[];

  embeddingModelId: string;
  dimensions: number;

  topK: number;
}

export interface VectorSearchResult {
  id: string;
  chunkId: string;
  documentId: string;

  content: string;

  score: number;
  metadata: Record<string, unknown>;
}

export interface DeleteVectorsInput {
  documentId: string;
  embeddingModelId?: string;
}

export interface VectorStore {
  readonly name: string;

  upsert(records: VectorRecord[]): Promise<void>;

  search(input: VectorSearchInput): Promise<VectorSearchResult[]>;

  deleteByDocument(input: DeleteVectorsInput): Promise<void>;
}
