import { Injectable } from "@nestjs/common";

import {
  RetrievalInput,
  RetrievedChunk,
} from "../interfaces/retrieval.interface";

import { VectorSearchService } from "./vector-search.service";
import { KeywordSearchService } from "./keyword-search.service";

@Injectable()
export class HybridSearchService {
  private readonly rrfConstant = 60;

  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly keywordSearch: KeywordSearchService,
  ) {}

  async search(input: RetrievalInput): Promise<RetrievedChunk[]> {
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch.search(input),
      this.keywordSearch.search(input),
    ]);

    const merged = new Map<string, RetrievedChunk>();

    this.addRankedResults(merged, vectorResults, "vector");
    this.addRankedResults(merged, keywordResults, "keyword");

    return [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, input.finalTopK ?? 20);
  }

  private addRankedResults(
    merged: Map<string, RetrievedChunk>,
    results: RetrievedChunk[],
    source: "vector" | "keyword",
  ): void {
    results.forEach((result, index) => {
      const rank = index + 1;
      const contribution = 1 / (this.rrfConstant + rank);

      const existing = merged.get(result.chunkId);

      if (existing) {
        existing.score += contribution;

        if (source === "vector") {
          existing.vectorScore = result.vectorScore;
        } else {
          existing.keywordScore = result.keywordScore;
        }

        return;
      }

      merged.set(result.chunkId, {
        ...result,
        score: contribution,
      });
    });
  }
}
