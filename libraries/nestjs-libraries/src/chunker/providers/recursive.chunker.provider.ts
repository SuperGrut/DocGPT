import {
  Chunker,
  TokenCounter,
} from "@docgpt/nestjs-libraries/chunker/chunker.interface";
import {
  Level,
  Part,
  splitRecursive,
} from "@docgpt/nestjs-libraries/chunker/chunker.utils";
import { BlockChunker } from "@docgpt/nestjs-libraries/chunker/providers/block.chunker";

const LEVELS: Level[] = [
  { pattern: /\n{2,}/, joiner: "\n\n" }, // paragraphs
  { pattern: /\n/, joiner: "\n" }, // lines
  { pattern: /(?<=[.!?])\s+/, joiner: " " }, // sentences
  { pattern: /\s+/, joiner: " " }, // words
];

/** Default. Keeps paragraphs whole when they fit, otherwise falls back to lines, sentences, words. */
@Chunker({ strategy: "recursive" })
export class RecursiveChunker extends BlockChunker {
  readonly name = "recursive";
  readonly version = "1";

  // Explicit constructor so Nest emits constructor metadata for injection.
  constructor(tokens: TokenCounter) {
    super(tokens);
  }

  protected splitText(text: string, maxTokens: number): Part[] {
    return splitRecursive(text, maxTokens, (s) => this.tokens.count(s), LEVELS);
  }
}
