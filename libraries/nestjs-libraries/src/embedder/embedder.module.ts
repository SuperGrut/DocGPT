import { Module } from "@nestjs/common";

import { EmbedderService } from "./embedder.service";
import { PgVectorStore } from "./pgvector.store";
import { EmbedderManager } from "./providers/embedder.manager";
import { LocalEmbedder } from "./providers/local.embedder.provider";
import { OpenAIEmbedder } from "./providers/openai.embedder.provider";
import { VectorStore } from "./vector-store.port";

@Module({
  providers: [
    { provide: VectorStore, useClass: PgVectorStore },
    OpenAIEmbedder, // importing the classes is what runs their @Embedder decorators
    LocalEmbedder,
    EmbedderManager,
    EmbedderService,
  ],
  exports: [EmbedderService],
})
export class EmbedderModule {}
