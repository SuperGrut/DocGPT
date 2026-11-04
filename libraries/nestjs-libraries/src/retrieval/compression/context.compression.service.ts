import { Injectable } from "@nestjs/common";

import { ContextCompressor } from "../interfaces/context-compressor.interface";

import { RetrievedChunk } from "../interfaces/retrieval.interface";

@Injectable()
export class ContextCompressionService {
  constructor(private readonly compressor: ContextCompressor) {}

  async compress(
    query: string,
    chunks: RetrievedChunk[],
    maxContextCharacters = 12000,
  ): Promise<RetrievedChunk[]> {
    return this.compressor.compress({
      query,
      chunks,
      maxContextCharacters,
    });
  }
}
