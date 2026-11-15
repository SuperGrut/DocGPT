import { Injectable } from "@nestjs/common";

import { TokenCounter } from "@docgpt/nestjs-libraries/chunker/chunker.interface";

/**
 * Dependency-free estimate: about 4 ASCII characters per token, 1 token per non-ASCII character.
 * Good enough to start. Replace it with a real tokenizer (for example js-tiktoken) once the
 * embedding model is chosen; only the binding in ChunkerModule changes.
 */
@Injectable()
export class ApproxTokenCounter extends TokenCounter {
  count(text: string): number {
    const nonAscii = text.replace(/[\x00-\x7F]/g, "").length;
    return Math.ceil((text.length - nonAscii) / 4) + nonAscii;
  }
}
