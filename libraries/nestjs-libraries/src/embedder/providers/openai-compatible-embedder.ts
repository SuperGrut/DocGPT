import {
  EmbedderError,
  EmbeddingProvider,
  EmbeddingRequestError,
} from "../embedder.interface";

const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shared client for any server that speaks POST {baseUrl}/embeddings (OpenAI, Ollama, vLLM). */
export abstract class OpenAICompatibleEmbedder extends EmbeddingProvider {
  protected abstract get baseUrl(): string;
  protected get apiKey(): string | undefined {
    return undefined;
  }
  /** Sent as `dimensions` when set (OpenAI text-embedding-3 only). */
  protected get requestDimensions(): number | undefined {
    return undefined;
  }
  protected get documentPrefix(): string {
    return "";
  }
  protected get queryPrefix(): string {
    return "";
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.request(texts.map((t) => this.documentPrefix + t));
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.request([this.queryPrefix + text]);
    return vector;
  }

  private async request(input: string[]): Promise<number[][]> {
    if (input.length === 0) return [];
    if (input.length > this.maxBatchSize) {
      throw new EmbedderError(
        `Batch of ${input.length} exceeds maxBatchSize ${this.maxBatchSize}`,
      );
    }

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.send(input);
      } catch (e) {
        if (
          !(e instanceof EmbeddingRequestError) ||
          !e.retryable ||
          attempt >= MAX_ATTEMPTS
        ) {
          throw e;
        }
        const backoff =
          Math.min(8_000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
        await sleep(e.retryAfterMs ?? backoff);
      }
    }
  }

  private async send(input: string[]): Promise<number[][]> {
    const body: Record<string, unknown> = { model: this.model, input };
    if (this.requestDimensions) body.dimensions = this.requestDimensions;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new EmbeddingRequestError(
        `Embedding request failed: ${(e as Error).message}`,
        undefined,
        true,
      );
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const retryAfter = Number(res.headers.get("retry-after"));
      throw new EmbeddingRequestError(
        `Embedding API returned ${res.status}: ${detail}`,
        res.status,
        res.status === 429 || res.status >= 500,
        retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : undefined,
      );
    }

    const json = (await res.json()) as {
      data?: { index: number; embedding: number[] }[];
    };
    const data = json.data;
    if (!data || data.length !== input.length) {
      throw new EmbedderError(
        `Expected ${input.length} embeddings, got ${data?.length ?? 0}`,
      );
    }

    const vectors = [...data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    for (const v of vectors) {
      if (v.length !== this.dimensions) {
        throw new EmbedderError(
          `Model '${this.model}' returned ${v.length} dimensions, expected ${this.dimensions}`,
        );
      }
    }
    return vectors;
  }
}
