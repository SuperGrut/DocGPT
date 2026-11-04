import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import {
  Embedder,
  EmbeddingProviderName,
} from "../interfaces/embedder.interface";

@Injectable()
export class OpenAIEmbedder implements Embedder {
  readonly provider: EmbeddingProviderName = "OPENAI";

  readonly model: string;
  readonly dimensions: number;

  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAIEmbedder.name);

  private readonly batchSize = 128;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>("OPENAI_API_KEY");

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    this.model = configService.get<string>(
      "OPENAI_EMBEDDING_MODEL",
      "text-embedding-3-small",
    );

    this.dimensions = configService.get<number>(
      "OPENAI_EMBEDDING_DIMENSIONS",
      1536,
    );

    this.client = new OpenAI({ apiKey });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.validateTexts(texts);

    const results: number[][] = [];

    for (const batch of this.createBatches(texts, this.batchSize)) {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        dimensions: this.dimensions,
        encoding_format: "float",
      });

      const embeddings = [...response.data]
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      this.validateEmbeddings(embeddings, batch.length);

      results.push(...embeddings);
    }

    return results;
  }

  async embedQuery(text: string): Promise<number[]> {
    this.validateTexts([text]);

    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
      encoding_format: "float",
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding) {
      throw new InternalServerErrorException(
        "OpenAI returned an empty query embedding",
      );
    }

    this.validateEmbeddings([embedding], 1);

    return embedding;
  }

  private validateTexts(texts: string[]): void {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error("At least one text is required");
    }

    if (texts.some((text) => !text || !text.trim())) {
      throw new Error("Texts cannot contain empty values");
    }
  }

  private validateEmbeddings(
    embeddings: number[][],
    expectedCount: number,
  ): void {
    if (embeddings.length !== expectedCount) {
      throw new Error("OpenAI returned an unexpected number of embeddings");
    }

    for (const embedding of embeddings) {
      if (
        embedding.length !== this.dimensions ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error("OpenAI returned an invalid embedding vector");
      }
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }
}
