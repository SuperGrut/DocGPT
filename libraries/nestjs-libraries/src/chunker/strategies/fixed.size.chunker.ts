import { Injectable } from "@nestjs/common";

import {
  ChunkInput,
  Chunker,
  DocumentChunk,
} from "../interfaces/chunker.interface";

@Injectable()
export class FixedSizeChunker implements Chunker {
  readonly name = "FIXED_SIZE" as const;

  async chunk(input: ChunkInput): Promise<DocumentChunk[]> {
    const { documentId, sections, options } = input;

    const { chunkSize, chunkOverlap } = options;

    this.validateOptions(options);

    const chunks: DocumentChunk[] = [];

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];

      const text = section.text;

      if (!text?.length) {
        continue;
      }

      let startOffset = 0;

      while (startOffset < text.length) {
        const endOffset = Math.min(startOffset + chunkSize, text.length);

        const content = text.slice(startOffset, endOffset);

        chunks.push({
          documentId,
          chunkIndex: chunks.length,
          content,
          metadata: {
            ...section.metadata,
            pageNumber: section.pageNumber,
            sectionTitle: section.sectionTitle,
            sheetName: section.sheetName,
            slideNumber: section.slideNumber,
            startOffset,
            endOffset,
            sourceSectionIndex: sectionIndex,
          },
        });

        if (endOffset === text.length) {
          break;
        }

        startOffset = endOffset - chunkOverlap;
      }
    }

    return chunks;
  }

  private validateOptions(options: ChunkInput["options"]): void {
    const { chunkSize, chunkOverlap, maxChunkSize } = options;

    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new Error("chunkSize must be a positive integer");
    }

    if (
      !Number.isInteger(chunkOverlap) ||
      chunkOverlap < 0 ||
      chunkOverlap >= chunkSize
    ) {
      throw new Error(
        "chunkOverlap must be a non-negative integer smaller than chunkSize",
      );
    }

    if (maxChunkSize !== undefined && maxChunkSize < chunkSize) {
      throw new Error("maxChunkSize cannot be smaller than chunkSize");
    }
  }
}
