import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { contextualText } from "../contextualizer/contextual-text";
import { EmbedderService } from "../embedder/embedder.service";
import { ContextCompressor } from "./compress/context.compressor";
import { reciprocalRankFusion } from "./fusion/rrf";
import { Reranker } from "./rerank/reranker.interface";
import { RerankerManager } from "./rerank/providers/reranker.manager";
import { RetrievalRepository } from "./retrieval.repository";
import type {
  RetrievalInput,
  RetrievedChunk,
  ScoredChunk,
} from "./retrieval.types";

@Injectable()
export class RetrievalService implements OnModuleInit {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly repo: RetrievalRepository,
    private readonly embedder: EmbedderService,
    private readonly rerankers: RerankerManager,
    private readonly compressor: ContextCompressor,
    private readonly config: ConfigService,
  ) {}

  // Fail at boot, not on the first question.
  onModuleInit() {
    this.reranker().validate();
  }

  async retrieve(input: RetrievalInput): Promise<RetrievedChunk[]> {
    const query = input.query.trim();
    if (!query) return [];

    const documentIds = await this.repo.resolveDocumentIds(
      input.userId,
      input.documentIds,
    );
    if (!documentIds.length) return [];

    // 1. Two searches in parallel.
    const fetchK = this.num("RETRIEVAL_FETCH_K", 50);
    const embedded = await this.embedder.embedQuery(query);

    const [vectorResult, keywordResult] = await Promise.allSettled([
      this.repo.vectorSearch({
        model: embedded.model,
        dimensions: embedded.dimensions,
        vector: embedded.vector,
        documentIds,
        limit: fetchK,
        iterativeScan: this.config.get("PGVECTOR_ITERATIVE_SCAN") !== "false",
      }),
      this.repo.keywordSearch({ query, documentIds, limit: fetchK }),
    ]);
    // One failing search degrades to the other. Both failing is a real outage, not "no results".
    if (
      vectorResult.status === "rejected" &&
      keywordResult.status === "rejected"
    ) {
      throw vectorResult.reason;
    }
    if (vectorResult.status === "rejected")
      this.logger.warn(`Vector search failed: ${vectorResult.reason}`);
    if (keywordResult.status === "rejected")
      this.logger.warn(`Keyword search failed: ${keywordResult.reason}`);
    const vectorHits =
      vectorResult.status === "fulfilled" ? vectorResult.value : [];
    const keywordHits =
      keywordResult.status === "fulfilled" ? keywordResult.value : [];

    // 2. Fuse by rank.
    const fused = reciprocalRankFusion(
      [
        { name: "vector", ids: vectorHits.map((h) => h.id) },
        { name: "keyword", ids: keywordHits.map((h) => h.id) },
      ],
      this.num("RRF_K", 60),
    ).slice(0, this.num("RERANK_TOP_N", 40));
    if (!fused.length) return [];

    const records = new Map(
      (await this.repo.getChunks(fused.map((f) => f.id))).map((r) => [r.id, r]),
    );
    const candidates: ScoredChunk[] = fused.flatMap((f) => {
      const record = records.get(f.id); // a chunk can vanish if the document is re-chunked mid-query
      return record ? [{ ...record, score: f.score }] : [];
    });

    // 3. Rerank.
    const finalK = Math.max(1, input.topK);
    const { ranked, reranked } = await this.rerank(query, candidates, finalK);

    // 4. Compress.
    const passages = this.compressor.compress({
      chunks: ranked,
      maxTokens: this.num("CHAT_CONTEXT_TOKENS", 6_000),
      minScore: reranked
        ? Number(this.config.get("RETRIEVAL_MIN_RERANK_SCORE") ?? 0)
        : 0,
    });

    if (this.config.get("RETRIEVAL_TRACE") === "true") {
      this.logger.debug(
        JSON.stringify({
          query,
          vector: vectorHits.map((h) => h.id),
          keyword: keywordHits.map((h) => h.id),
          fused: fused.map((f) => f.id),
          reranked,
          ranked: ranked.map((c) => ({ id: c.id, score: c.score })),
          final: passages.map((p) => ({ id: p.chunkId, score: p.score })),
        }),
      );
    }

    return passages.map((p) => ({
      chunkId: p.chunkId,
      documentId: p.documentId,
      fileName: p.fileName,
      text: p.text, // the original text, not the generated context
      pageStart: p.pageStart,
      pageEnd: p.pageEnd,
      score: p.score,
    }));
  }

  private async rerank(
    query: string,
    candidates: ScoredChunk[],
    finalK: number,
  ) {
    const reranker = this.reranker();
    const fusedOrder = { ranked: candidates.slice(0, finalK), reranked: false };
    if (!reranker.enabled || candidates.length <= 1) return fusedOrder;

    try {
      const results = await reranker.rerank(
        query,
        candidates.map((c) => ({ id: c.id, text: contextualText(c) })),
        finalK,
      );
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const ranked = results
        .sort((a, b) => b.score - a.score)
        .slice(0, finalK)
        .flatMap((r) => {
          const chunk = byId.get(r.id);
          return chunk ? [{ ...chunk, score: r.score }] : [];
        });
      return { ranked, reranked: true };
    } catch (e) {
      // A slow or broken reranker should cost quality, not the whole answer.
      this.logger.warn(
        `Reranker '${reranker.name}' failed, using fused order: ${(e as Error).message}`,
      );
      return fusedOrder;
    }
  }

  private reranker(): Reranker {
    return this.rerankers.get(
      this.config.get<string>("RERANK_PROVIDER") ?? "none",
    );
  }

  private num(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
