import { ConfigService } from "@nestjs/config";

import {
  ChunkContextualizer,
  ContextualizeInput,
  Contextualizer,
} from "@docgpt/nestjs-libraries/contextualizer/contextualizer.interface";
import {
  CONTEXT_SYSTEM_PROMPT,
  chunkInstruction,
  documentBlock,
} from "@docgpt/nestjs-libraries/contextualizer/contextualizer.prompt";
import { postJson } from "@docgpt/nestjs-libraries/contextualizer/providers/http";

interface MessagesResponse {
  content?: { type: string; text?: string }[];
}

/**
 * Hosted default. The document goes first in a cache_control block and the chunk after it, so every
 * chunk in a window after the first reads the document from the prompt cache instead of paying for it again.
 * (Prompts shorter than the model's minimum cacheable length simply run uncached.)
 */
@Contextualizer({ provider: "anthropic" })
export class AnthropicContextualizer extends ChunkContextualizer {
  readonly name = "anthropic";

  constructor(private readonly config: ConfigService) {
    super();
  }

  // Getters keep config lazy, so an app using another provider never needs these env vars.
  get model(): string {
    return (
      this.config.get<string>("CONTEXTUALIZER_MODEL") ?? "claude-haiku-5-5"
    );
  }
  get maxConcurrency(): number {
    return Number(this.config.get("CONTEXTUALIZER_CONCURRENCY") ?? 8);
  }
  get maxDocumentTokens(): number {
    return Number(this.config.get("CONTEXTUALIZER_WINDOW_TOKENS") ?? 60_000);
  }
  private get apiKey(): string {
    return this.config.getOrThrow<string>("ANTHROPIC_API_KEY");
  }
  private get baseUrl(): string {
    return (
      this.config.get<string>("ANTHROPIC_BASE_URL") ??
      "https://api.anthropic.com"
    );
  }

  validate(): void {
    void this.apiKey;
  }

  async contextualize(input: ContextualizeInput): Promise<string> {
    const json = await postJson<MessagesResponse>(
      `${this.baseUrl}/v1/messages`,
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: input.maxTokens,
        temperature: 0,
        system: CONTEXT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: documentBlock(input.document),
                cache_control: { type: "ephemeral" },
              },
              {
                type: "text",
                text: chunkInstruction(input.chunk, input.maxTokens),
              },
            ],
          },
        ],
      },
    );

    return (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }
}
