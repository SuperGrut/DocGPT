import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { EmbedderRegistry } from "./embedder.registry";
import { EmbeddingService } from "./embedding.service";

import { OpenAIEmbedder } from "./providers/openai.embedder";
import { GeminiEmbedder } from "./providers/gemini.embedder";
import { LocalEmbedder } from "./providers/local.embedder";

@Module({
  imports: [ConfigModule],
  providers: [
    OpenAIEmbedder,
    GeminiEmbedder,
    LocalEmbedder,

    EmbedderRegistry,
    EmbeddingService,
  ],
  exports: [EmbeddingService],
})
export class EmbedderModule {}
