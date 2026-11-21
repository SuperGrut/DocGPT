import {
  ChunkContextualizer,
  Contextualizer,
} from "@docgpt/nestjs-libraries/contextualizer/contextualizer.interface";

/** Default. Chunks are embedded and indexed as they are. */
@Contextualizer({ provider: "none" })
export class NoopContextualizer extends ChunkContextualizer {
  readonly name = "none";
  readonly model = "none";
  readonly maxConcurrency = 1;
  readonly maxDocumentTokens = 0;

  get enabled(): boolean {
    return false;
  }

  async contextualize(): Promise<string> {
    return "";
  }
}
