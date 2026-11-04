import { Injectable, NotFoundException } from "@nestjs/common";

import {
  Embedder,
  EmbeddingProviderName,
} from "./interfaces/embedder.interface";

import { OpenAIEmbedder } from "./providers/openai.embedder";
import { GeminiEmbedder } from "./providers/gemini.embedder";
import { LocalEmbedder } from "./providers/local.embedder";

@Injectable()
export class EmbedderRegistry {
  private readonly embedders: Map<EmbeddingProviderName, Embedder>;

  constructor(
    openAIEmbedder: OpenAIEmbedder,
    geminiEmbedder: GeminiEmbedder,
    localEmbedder: LocalEmbedder,
  ) {
    this.embedders = new Map([
      ["OPENAI", openAIEmbedder],
      ["GEMINI", geminiEmbedder],
      ["LOCAL", localEmbedder],
    ]);
  }

  get(provider: EmbeddingProviderName): Embedder {
    const embedder = this.embedders.get(provider);

    if (!embedder) {
      throw new NotFoundException(
        `Embedding provider ${provider} is not registered`,
      );
    }

    return embedder;
  }
}
