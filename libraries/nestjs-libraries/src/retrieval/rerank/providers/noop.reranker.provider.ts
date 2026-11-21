import { Reranker, RerankerProvider } from "../reranker.interface";

@RerankerProvider({ provider: "none" })
export class NoopReranker extends Reranker {
  readonly name = "none";
  override readonly enabled = false;

  async rerank(): Promise<never[]> {
    return [];
  }
}
