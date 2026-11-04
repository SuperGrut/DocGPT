import { Injectable } from "@nestjs/common";

import { EmbeddingService } from "../../embedder/embedding.service";
import { VectorStorageService } from "../../vector-store/vector-storage.service";

import {
  RetrievalInput,
  RetrievedChunk,
} from "../interfaces/retrieval.interface";

@Injectable()
export class VectorSearchService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStorageService: VectorStorageService,
  ) {}

  async search(input: RetrievalInput): Promise<RetrievedChunk[]> {
    if (!input.documentIds.length) {
      return [];
    }

    const queryEmbedding = await this.embeddingService.embedQuery(input.query);

    const results = await this.vectorStorageService.search({
      queryEmbedding,
      userId: input.userId,
      documentIds: input.documentIds,
      embeddingModelId: input.embeddingModelId,
      dimensions: input.dimensions,
      topK: input.vectorTopK ?? 20,
    });

    return results.map((result) => ({
      chunkId: result.chunkId,
      documentId: result.documentId,
      content: result.content,
      metadata: result.metadata,
      score: result.score,
      vectorScore: result.score,
    }));
  }
}
