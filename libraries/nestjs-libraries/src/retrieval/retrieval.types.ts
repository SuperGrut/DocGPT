export interface RetrievalInput {
  userId: string;
  query: string;
  /** Undefined or empty = all of the user's documents. */
  documentIds?: string[];
  /** Final number of ranked results before compression. */
  topK: number;
}

/** Structurally compatible with the chat module's RetrievedChunk. */
export interface RetrievedChunk {
  /** Id of the highest-scoring chunk in the passage. */
  chunkId: string;
  documentId: string;
  fileName: string;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  fileName: string;
  index: number;
  text: string;
  context: string | null;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface ScoredChunk extends ChunkRecord {
  score: number;
}

/** One or more adjacent chunks merged into a single passage. */
export interface Passage {
  chunkId: string;
  documentId: string;
  fileName: string;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
}
