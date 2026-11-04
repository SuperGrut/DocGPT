import { Injectable } from "@nestjs/common";

import { ContextCompressor } from "../interfaces/context-compressor.interface";

import { RetrievedChunk } from "../interfaces/retrieval.interface";

@Injectable()
export class PassthroughCompressor implements ContextCompressor {
  async compress(input: {
    query: string;
    chunks: RetrievedChunk[];
    maxContextCharacters: number;
  }): Promise<RetrievedChunk[]> {
    const results: RetrievedChunk[] = [];
    let remaining = input.maxContextCharacters;

    for (const chunk of input.chunks) {
      if (remaining <= 0) {
        break;
      }

      // Do not truncate a chunk: retain its original citation identity.
      if (chunk.content.length > remaining) {
        break;
      }

      results.push(chunk);
      remaining -= chunk.content.length;
    }

    return results;
  }
}
