import { ConfigService } from "@nestjs/config";

import { Embedder } from "../embedder.interface";
import { OpenAICompatibleEmbedder } from "./openai-compatible.embedder";

/** Dev fallback: Ollama (or any OpenAI-compatible server) running locally. */
@Embedder({ provider: "local" })
export class LocalEmbedder extends OpenAICompatibleEmbedder {
  readonly name = "local";
  readonly maxBatchSize = 32;

  constructor(private readonly config: ConfigService) {
    super();
  }

  get model(): string {
    return (
      this.config.get<string>("LOCAL_EMBEDDING_MODEL") ?? "nomic-embed-text"
    );
  }
  get dimensions(): number {
    return Number(this.config.get("LOCAL_EMBEDDING_DIMENSIONS") ?? 768);
  }
  get maxInputTokens(): number {
    return Number(this.config.get("LOCAL_EMBEDDING_MAX_TOKENS") ?? 2048);
  }
  protected get baseUrl(): string {
    return (
      this.config.get<string>("LOCAL_EMBEDDING_BASE_URL") ??
      "http://localhost:11434/v1"
    );
  }
  // nomic-embed-text wants "search_document: " and "search_query: ". Set them in env if you use it.
  protected get documentPrefix(): string {
    return this.config.get<string>("LOCAL_EMBEDDING_DOCUMENT_PREFIX") ?? "";
  }
  protected get queryPrefix(): string {
    return this.config.get<string>("LOCAL_EMBEDDING_QUERY_PREFIX") ?? "";
  }
}
