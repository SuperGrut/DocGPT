import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { contextualText } from "../contextualizer/contextual-text";
import { PrismaService } from "../prisma/prisma.service"; // match the loader/chunker import
import { EmbedderError, EmbeddingProvider } from "./embedder.interface";
import { EmbedderManager } from "./providers/embedder.manager";
import { VectorStore } from "./vector-store.port";

@Injectable()
export class EmbedderService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: EmbedderManager,
    private readonly store: VectorStore,
    private readonly config: ConfigService,
  ) {}

  // Fail at boot, not on the first document.
  onModuleInit() {
    const provider = this.provider();
    provider.validate();

    // A contextualized chunk is the chunk plus its generated context, so both must fit.
    const chunkMax = Number(this.config.get("CHUNK_MAX_TOKENS") ?? 512);
    if (chunkMax + this.contextMax > provider.maxInputTokens) {
      throw new Error(
        `CHUNK_MAX_TOKENS (${chunkMax}) + CONTEXT_MAX_TOKENS (${this.contextMax}) exceeds ${provider.name} maxInputTokens (${provider.maxInputTokens})`,
      );
    }
  }

  /** `onBatch` lets the Temporal activity heartbeat without this service importing Temporal. */
  async embed(documentId: string, onBatch?: () => void) {
    const provider = this.provider();

    const total = await this.prisma.documentChunk.count({
      where: { documentId },
    });
    if (total === 0) {
      throw new EmbedderError(
        `No chunks for document ${documentId}; run the chunker first`,
      );
    }

    // Only chunks without a vector for this model, so a retry resumes where it stopped.
    // (The contextualizer deletes a chunk's vectors when it writes a context, so those come back here.)
    const pending = await this.prisma.documentChunk.findMany({
      where: { documentId, embeddings: { none: { model: provider.model } } },
      orderBy: { index: "asc" },
      select: { id: true, text: true, context: true, tokenCount: true },
    });

    const tooLong = pending.find(
      (c) =>
        c.tokenCount + (c.context ? this.contextMax : 0) >
        provider.maxInputTokens,
    );
    if (tooLong) {
      throw new EmbedderError(
        `Chunk ${tooLong.id} has ${tooLong.tokenCount} tokens plus context, over the ${provider.maxInputTokens} limit`,
      );
    }

    for (let i = 0; i < pending.length; i += provider.maxBatchSize) {
      const batch = pending.slice(i, i + provider.maxBatchSize);
      const vectors = await provider.embedDocuments(
        batch.map((c) => contextualText(c)),
      );

      await this.store.upsert(
        batch.map((c, j) => ({
          chunkId: c.id,
          model: provider.model,
          vector: vectors[j],
        })),
      );
      onBatch?.();
    }

    // Return a reference only, like the loader and chunker.
    return {
      documentId,
      model: provider.model,
      embeddedCount: pending.length,
      totalChunks: total,
    };
  }

  /** Room reserved for the generated context. Zero when the contextualizer is off. */
  private get contextMax(): number {
    const contextualizer =
      this.config.get<string>("CONTEXTUALIZER_PROVIDER") ?? "none";
    return contextualizer === "none"
      ? 0
      : Number(this.config.get("CONTEXT_MAX_TOKENS") ?? 100);
  }

  private provider(): EmbeddingProvider {
    return this.manager.get(
      this.config.get<string>("EMBEDDING_PROVIDER") ?? "openai",
    );
  }
}
