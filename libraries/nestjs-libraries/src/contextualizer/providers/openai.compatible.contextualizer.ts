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

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * Self-hosted: any server that speaks POST {baseUrl}/chat/completions (Ollama, vLLM, llama.cpp, OpenAI).
 * The document comes first and the chunk last, so servers with prefix caching can reuse the document.
 * Ollama truncates input beyond its context length without an error. Raise its context length
 * (for example OLLAMA_CONTEXT_LENGTH) together with LOCAL_CONTEXTUALIZER_WINDOW_TOKENS.
 */
@Contextualizer({ provider: "local" })
export class LocalContextualizer extends ChunkContextualizer {
  readonly name = "local";

  constructor(private readonly config: ConfigService) {
    super();
  }

  get model(): string {
    return (
      this.config.get<string>("LOCAL_CONTEXTUALIZER_MODEL") ?? "llama3.2:3b"
    );
  }
  get maxConcurrency(): number {
    return Number(this.config.get("LOCAL_CONTEXTUALIZER_CONCURRENCY") ?? 2);
  }
  get maxDocumentTokens(): number {
    return Number(
      this.config.get("LOCAL_CONTEXTUALIZER_WINDOW_TOKENS") ?? 3_000,
    );
  }
  private get baseUrl(): string {
    return (
      this.config.get<string>("LOCAL_CONTEXTUALIZER_BASE_URL") ??
      "http://localhost:11434/v1"
    );
  }

  async contextualize(input: ContextualizeInput): Promise<string> {
    const apiKey = this.config.get<string>("LOCAL_CONTEXTUALIZER_API_KEY");

    const json = await postJson<ChatCompletionResponse>(
      `${this.baseUrl}/chat/completions`,
      apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      {
        model: this.model,
        max_tokens: input.maxTokens,
        temperature: 0,
        messages: [
          { role: "system", content: CONTEXT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${documentBlock(input.document)}\n\n${chunkInstruction(input.chunk, input.maxTokens)}`,
          },
        ],
      },
    );

    return json.choices?.[0]?.message?.content ?? "";
  }
}
