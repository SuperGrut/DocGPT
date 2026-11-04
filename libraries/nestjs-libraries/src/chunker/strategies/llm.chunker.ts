import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  ChunkInput,
  Chunker,
  DocumentChunk,
} from "../interfaces/chunker.interface";

import { RecursiveChunker } from "./recursive.chunker";

export const SEMANTIC_BOUNDARY_DETECTOR = Symbol("SEMANTIC_BOUNDARY_DETECTOR");

export interface SemanticChunkBoundary {
  start: number;
  end: number;
}

export interface SemanticBoundaryDetector {
  detectBoundaries(input: {
    text: string;
    maxChunkSize: number;
  }): Promise<SemanticChunkBoundary[]>;
}

@Injectable()
export class LlmChunker implements Chunker {
  readonly name = "LLM" as const;

  private readonly logger = new Logger(LlmChunker.name);

  constructor(
    @Inject(SEMANTIC_BOUNDARY_DETECTOR)
    private readonly boundaryDetector: SemanticBoundaryDetector,

    private readonly recursiveChunker: RecursiveChunker,
  ) {}

  async chunk(input: ChunkInput): Promise<DocumentChunk[]> {
    const { documentId, sections, options } = input;

    this.validateOptions(options);

    const chunks: DocumentChunk[] = [];

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];

      if (!section.text?.length) {
        continue;
      }

      try {
        const boundaries = await this.boundaryDetector.detectBoundaries({
          text: section.text,
          maxChunkSize: options.maxChunkSize ?? options.chunkSize,
        });

        const validatedBoundaries = this.validateBoundaries(
          boundaries,
          section.text.length,
          options.maxChunkSize ?? options.chunkSize,
        );

        for (const boundary of validatedBoundaries) {
          const content = section.text.slice(boundary.start, boundary.end);

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
              startOffset: boundary.start,
              endOffset: boundary.end,
              sourceSectionIndex: sectionIndex,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `LLM chunking failed for section ${sectionIndex}. Falling back to recursive chunking.`,
        );

        const fallbackChunks = await this.recursiveChunker.chunk({
          documentId,
          sections: [section],
          options: {
            ...options,
            strategy: "RECURSIVE",
          },
        });

        for (const chunk of fallbackChunks) {
          chunks.push({
            ...chunk,
            chunkIndex: chunks.length,
            metadata: {
              ...chunk.metadata,
              sourceSectionIndex: sectionIndex,
            },
          });
        }
      }
    }

    return chunks;
  }

  private validateBoundaries(
    boundaries: SemanticChunkBoundary[],
    textLength: number,
    maxChunkSize: number,
  ): SemanticChunkBoundary[] {
    if (!Array.isArray(boundaries) || boundaries.length === 0) {
      throw new Error("LLM returned no chunk boundaries");
    }

    const validated: SemanticChunkBoundary[] = [];

    let previousEnd = 0;

    for (const boundary of boundaries) {
      if (
        !Number.isInteger(boundary.start) ||
        !Number.isInteger(boundary.end) ||
        boundary.start < 0 ||
        boundary.end > textLength ||
        boundary.start >= boundary.end
      ) {
        throw new Error("LLM returned an invalid boundary");
      }

      if (boundary.start !== previousEnd) {
        throw new Error("LLM boundaries contain gaps or overlaps");
      }

      if (boundary.end - boundary.start > maxChunkSize) {
        throw new Error("LLM returned a chunk exceeding maxChunkSize");
      }

      validated.push(boundary);

      previousEnd = boundary.end;
    }

    if (previousEnd !== textLength) {
      throw new Error("LLM boundaries do not cover the entire section");
    }

    return validated;
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
      throw new Error("Invalid chunkOverlap");
    }
  }
}
