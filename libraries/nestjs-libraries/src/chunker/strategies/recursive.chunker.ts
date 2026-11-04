import { Injectable } from "@nestjs/common";

import {
  ChunkInput,
  Chunker,
  DocumentChunk,
  ParsedSection,
} from "../interfaces/chunker.interface";

interface TextRange {
  start: number;
  end: number;
}

@Injectable()
export class RecursiveChunker implements Chunker {
  readonly name = "RECURSIVE" as const;

  private readonly separators = ["\n\n", "\n", ". ", "? ", "! ", " "];

  async chunk(input: ChunkInput): Promise<DocumentChunk[]> {
    const { documentId, sections, options } = input;

    this.validateOptions(options);

    const chunks: DocumentChunk[] = [];

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];

      if (!section.text?.length) {
        continue;
      }

      const ranges = this.createRanges(
        section.text,
        options.chunkSize,
        options.chunkOverlap,
      );

      for (const range of ranges) {
        const content = section.text.slice(range.start, range.end);

        if (!content.trim()) {
          continue;
        }

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
            startOffset: range.start,
            endOffset: range.end,
            sourceSectionIndex: sectionIndex,
          },
        });
      }
    }

    return chunks;
  }

  private createRanges(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): TextRange[] {
    const ranges: TextRange[] = [];

    let start = 0;

    while (start < text.length) {
      const hardEnd = Math.min(start + chunkSize, text.length);

      if (hardEnd === text.length) {
        ranges.push({
          start,
          end: hardEnd,
        });

        break;
      }

      const end = this.findBoundary(text, start, hardEnd);

      ranges.push({
        start,
        end,
      });

      start = Math.max(start + 1, end - chunkOverlap);
    }

    return ranges;
  }

  private findBoundary(text: string, start: number, hardEnd: number): number {
    const minimumBoundary = start + Math.floor((hardEnd - start) * 0.5);

    for (const separator of this.separators) {
      const boundary = text.lastIndexOf(separator, hardEnd - 1);

      if (boundary >= minimumBoundary) {
        return boundary + separator.length;
      }
    }

    // No natural boundary found. Use a hard character split.
    return hardEnd;
  }

  private validateOptions(options: ChunkInput["options"]): void {
    const { chunkSize, chunkOverlap } = options;

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

    if (
      options.maxChunkSize !== undefined &&
      options.maxChunkSize < chunkSize
    ) {
      throw new Error("maxChunkSize cannot be smaller than chunkSize");
    }
  }
}
