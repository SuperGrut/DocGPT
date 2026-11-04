import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";

import {
  Embedder,
  EmbeddingProviderName,
} from "../interfaces/embedder.interface";

@Injectable()
export class GeminiEmbedder implements Embedder {
  readonly provider: EmbeddingProviderName = "GEMINI";

  readonly model: string;
  readonly dimensions: number;

  private readonly client: GoogleGenAI;
  private readonly logger = new Logger(GeminiEmbedder.name);

  private readonly batchSize = 50;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>("GEMINI_API_KEY");

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    this.model = configService.get<string>(
      "GEMINI_EMBEDDING_MODEL",
      "gemini-embedding-001",
    );

    this.dimensions = configService.get<number>(
      "GEMINI_EMBEDDING_DIMENSIONS",
      768,
    );

    this.client = new GoogleGenAI({ apiKey });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.validateTexts(texts);

    const results: number[][] = [];

    for (const batch of this.createBatches(texts, this.batchSize)) {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: batch,
        config: {
          outputDimensionality: this.dimensions,
        },
      });

      const embeddings =
        response.embeddings?.map((item) => item.values ?? []) ?? [];

      this.validateEmbeddings(embeddings, batch.length);

      results.push(...embeddings);
    }

    return results;
  }

  async embedQuery(text: string): Promise<number[]> {
    this.validateTexts([text]);

    const response = await this.client.models.embedContent({
      model: this.model,
      contents: text,
      config: {
        outputDimensionality: this.dimensions,
      },
    });

    const embedding = response.embeddings?.[0]?.values;

    if (!embedding) {
      throw new InternalServerErrorException(
        "Gemini returned an empty query embedding",
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
      throw new Error("Gemini returned an unexpected number of embeddings");
    }

    for (const embedding of embeddings) {
      if (
        embedding.length !== this.dimensions ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error("Gemini returned an invalid embedding vector");
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
