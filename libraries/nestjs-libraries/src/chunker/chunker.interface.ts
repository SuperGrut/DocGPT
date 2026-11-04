export type ChunkingStrategy = "FIXED_SIZE" | "RECURSIVE" | "LLM";

export interface ParsedSection {
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
  sheetName?: string;
  slideNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkingOptions {
  strategy: ChunkingStrategy;

  /**
   * Maximum target chunk size.
   * This implementation measures characters, not tokens.
   */
  chunkSize: number;

  /**
   * Number of overlapping characters between chunks.
   */
  chunkOverlap: number;

  /**
   * Maximum permitted chunk size.
   */
  maxChunkSize?: number;
}

export interface ChunkInput {
  documentId: string;
  sections: ParsedSection[];
  options: ChunkingOptions;
}

export interface ChunkMetadata {
  pageNumber?: number;
  sectionTitle?: string;
  sheetName?: string;
  slideNumber?: number;

  /**
   * Character offsets within the original ParsedSection.
   * End offset is exclusive.
   */
  startOffset: number;
  endOffset: number;

  sourceSectionIndex: number;

  [key: string]: unknown;
}

export interface DocumentChunk {
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: ChunkMetadata;
}

export interface Chunker {
  readonly name: ChunkingStrategy;

  chunk(input: ChunkInput): Promise<DocumentChunk[]>;
}
