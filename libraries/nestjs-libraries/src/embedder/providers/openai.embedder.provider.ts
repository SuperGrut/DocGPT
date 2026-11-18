import { ConfigService } from "@nestjs/config";

import { Embedder } from "../embedder.interface";
import { OpenAICompatibleEmbedder } from "./openai-compatible.embedder";

@Embedder({ provider: "openai" })
export class OpenAIEmbedder extends OpenAICompatibleEmbedder {
  readonly name = "openai";
  readonly maxInputTokens = 8191;
  readonly maxBatchSize = 96;

  constructor(private readonly config: ConfigService) {
    super();
  }

  // Getters keep config lazy, so an app using another provider never needs these env vars.
  get model(): string {
    return (
      this.config.get<string>("EMBEDDING_MODEL") ?? "text-embedding-3-small"
    );
  }
  get dimensions(): number {
    return Number(this.config.get("EMBEDDING_DIMENSIONS") ?? 1536);
  }
  protected get baseUrl(): string {
    return (
      this.config.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1"
    );
  }
  protected get apiKey(): string {
    return this.config.getOrThrow<string>("OPENAI_API_KEY");
  }
  protected get requestDimensions(): number | undefined {
    return this.model.startsWith("text-embedding-3")
      ? this.dimensions
      : undefined;
  }

  validate(): void {
    void this.apiKey;
  }
}
