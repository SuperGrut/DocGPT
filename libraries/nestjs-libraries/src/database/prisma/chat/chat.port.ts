/** What chat needs from your retrieval pipeline. Bind with useExisting if the signature matches, else write a thin adapter. */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  fileName: string;
  text: string;
  pageStart?: number | null;
  pageEnd?: number | null;
}

export abstract class ChatRetriever {
  /** `documentIds` undefined = all of the user's documents. Results are best-first. */
  abstract retrieve(input: {
    userId: string;
    query: string;
    documentIds?: string[];
    topK: number;
  }): Promise<RetrievedChunk[]>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** What chat needs from your LLM client. */
export abstract class ChatLlm {
  /** Must stop producing tokens when `signal` aborts. */
  abstract stream(input: {
    messages: LlmMessage[];
    signal?: AbortSignal;
  }): AsyncIterable<string>;
  abstract complete(input: {
    messages: LlmMessage[];
    maxTokens?: number;
  }): Promise<string>;
}
