export type EmbeddingProviderName = "OPENAI" | "GEMINI" | "LOCAL";

export interface EmbedderConfig {
  provider: EmbeddingProviderName;
  model: string;
  dimensions: number;
}

export interface Embedder {
  readonly provider: EmbeddingProviderName;
  readonly model: string;
  readonly dimensions: number;

  /**
   * Generate vectors for document chunks.
   */
  embedDocuments(texts: string[]): Promise<number[][]>;

  /**
   * Generate a vector for a user's search query.
   */
  embedQuery(text: string): Promise<number[]>;
}
