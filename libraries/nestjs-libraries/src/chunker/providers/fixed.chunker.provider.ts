import {
  Chunker,
  TokenCounter,
} from "@docgpt/nestjs-libraries/chunker/chunker.interface";
import {
  Part,
  splitRecursive,
} from "@docgpt/nestjs-libraries/chunker/chunker.utils";
import { BlockChunker } from "@docgpt/nestjs-libraries/chunker/providers/block.chunker";

/** Simple size + overlap windows over words. Ignores paragraph and sentence boundaries. */
@Chunker({ strategy: "fixed" })
export class FixedChunker extends BlockChunker {
  readonly name = "fixed";
  readonly version = "1";

  constructor(tokens: TokenCounter) {
    super(tokens);
  }

  protected splitText(text: string, maxTokens: number): Part[] {
    const count = (s: string) => this.tokens.count(s);
    return text
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((word, i) =>
        splitRecursive(word, maxTokens, count, [], i === 0 ? "" : " "),
      );
  }
}
