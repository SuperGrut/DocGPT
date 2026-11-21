export interface RetrievalLlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** What retrieval needs from your LLM client (used by the LLM reranker). */
export abstract class RetrievalLlm {
  abstract complete(input: {
    messages: RetrievalLlmMessage[];
    maxTokens?: number;
  }): Promise<string>;
}
