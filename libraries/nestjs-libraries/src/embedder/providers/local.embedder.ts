import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  Embedder,
  EmbeddingProviderName,
} from "../interfaces/embedder.interface";

type FeatureExtractionPipeline = (
  inputs: string | string[],
  options?: {
    pooling?: "mean" | "cls" | "last_token";
    normalize?: boolean;
  },
) => Promise<{
  tolist(): unknown;
}>;

type PipelineFactory = (
  task: "feature-extraction",
  model: string,
) => Promise<FeatureExtractionPipeline>;

@Injectable()
export class LocalEmbedder implements Embedder {
  readonly provider: EmbeddingProviderName = "LOCAL";

  readonly model: string;
  readonly dimensions: number;

  private readonly logger = new Logger(LocalEmbedder.name);

  private pipelinePromise?: Promise<FeatureExtractionPipeline>;

  private readonly batchSize = 32;

  constructor(configService: ConfigService) {
    this.model = configService.get<string>(
      "LOCAL_EMBEDDING_MODEL",
      "Xenova/all-MiniLM-L6-v2",
    );

    this.dimensions = configService.get<number>(
      "LOCAL_EMBEDDING_DIMENSIONS",
      384,
    );
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.validateTexts(texts);

    const results: number[][] = [];

    for (const batch of this.createBatches(texts, this.batchSize)) {
      const embeddings = await this.runPipeline(batch);

      results.push(...embeddings);
    }

    return results;
  }

  async embedQuery(text: string): Promise<number[]> {
    this.validateTexts([text]);

    const embeddings = await this.runPipeline([text]);

    return embeddings[0];
  }

  private async runPipeline(texts: string[]): Promise<number[][]> {
    try {
      const pipeline = await this.getPipeline();

      const output = await pipeline(texts, {
        pooling: "mean",
        normalize: true,
      });

      const values = output.tolist();

      if (!Array.isArray(values)) {
        throw new Error("Local model returned invalid output");
      }

      const embeddings = values as number[][];

      this.validateEmbeddings(embeddings, texts.length);

      return embeddings;
    } catch (error) {
      this.logger.error(
        "Local embedding generation failed",
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException(
        "Unable to generate local embeddings",
      );
    }
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.initializePipeline();
    }

    return this.pipelinePromise;
  }

  private async initializePipeline(): Promise<FeatureExtractionPipeline> {
    const { pipeline } = await import("@huggingface/transformers");

    return pipeline(
      "feature-extraction",
      this.model,
    ) as unknown as FeatureExtractionPipeline;
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
      throw new Error(
        "Local model returned an unexpected number of embeddings",
      );
    }

    for (const embedding of embeddings) {
      if (
        !Array.isArray(embedding) ||
        embedding.length !== this.dimensions ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error("Local model returned an invalid embedding vector");
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
