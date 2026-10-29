// chat/interfaces/retrieval.interface.ts

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  content: string;
  pageNumber?: number;
  score?: number;
}

export interface RetrievalInput {
  query: string;
  documentIds: string[];
  topK?: number;
}

export interface RetrievalService {
  search(input: RetrievalInput): Promise<RetrievedChunk[]>;
}
