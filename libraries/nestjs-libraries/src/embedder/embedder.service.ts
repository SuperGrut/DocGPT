import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  Embedder,
  EmbeddingProviderName,
} from "./interfaces/embedder.interface";

import { EmbedderRegistry } from "./embedder.registry";

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  private readonly embedder: Embedder;

  constructor(
    private readonly registry: EmbedderRegistry,
    configService: ConfigService,
  ) {
    const provider = configService.get<EmbeddingProviderName>(
      "EMBEDDING_PROVIDER",
      "OPENAI",
    );

    this.embedder = this.registry.get(provider);

    this.logger.log(
      `Using ${this.embedder.provider} embedding provider: ${this.embedder.model} (${this.embedder.dimensions} dimensions)`,
    );
  }

  /**
   * Embed document chunks during ingestion.
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.validateTexts(texts);

    if (texts.length === 0) {
      return [];
    }

    const embeddings = await this.embedder.embedDocuments(texts);

    this.validateEmbeddings(embeddings, texts.length);

    return embeddings;
  }

  /**
   * Embed a user query during retrieval.
   */
  async embedQuery(text: string): Promise<number[]> {
    this.validateTexts([text]);

    const embedding = await this.embedder.embedQuery(text);

    this.validateEmbeddings([embedding], 1);

    return embedding;
  }

  /**
   * Return the active model configuration.
   *
   * Persist this information with your embedding records.
   */
  getModelConfig(): {
    provider: EmbeddingProviderName;
    model: string;
    dimensions: number;
  } {
    return {
      provider: this.embedder.provider,
      model: this.embedder.model,
      dimensions: this.embedder.dimensions,
    };
  }

  private validateTexts(texts: string[]): void {
    if (!Array.isArray(texts)) {
      throw new BadRequestException("Texts must be an array");
    }

    if (texts.some((text) => typeof text !== "string" || !text.trim())) {
      throw new BadRequestException("Texts must contain non-empty strings");
    }
  }

  private validateEmbeddings(
    embeddings: number[][],
    expectedCount: number,
  ): void {
    if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
      throw new InternalServerErrorException(
        "Embedding provider returned an unexpected number of vectors",
      );
    }

    const expectedDimensions = this.embedder.dimensions;

    for (const embedding of embeddings) {
      if (
        !Array.isArray(embedding) ||
        embedding.length !== expectedDimensions ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new InternalServerErrorException(
          `Invalid embedding vector. Expected ${expectedDimensions} dimensions.`,
        );
      }
    }
  }
}
