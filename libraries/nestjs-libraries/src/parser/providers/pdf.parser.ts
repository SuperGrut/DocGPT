import { Injectable, BadRequestException } from "@nestjs/common";
import pdf from "pdf-parse";

import {
  DocumentParser,
  ParsedContent,
} from "@docgpt/nestjs-libraries/parser/parser.interface";

@Injectable()
export class PdfParser implements DocumentParser {
  readonly metadata = {
    id: "pdf",
    supportedMimeTypes: ["application/pdf"],
    supportedExtensions: [".pdf"],
    version: "1.0.0",
  };

  supports(input: { fileName: string; mimeType: string }): boolean {
    return (
      input.mimeType === "application/pdf" ||
      input.fileName.toLowerCase().endsWith(".pdf")
    );
  }

  async parse(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<ParsedContent> {
    if (!input.buffer?.length) {
      throw new BadRequestException("PDF file is empty");
    }

    try {
      const result = await pdf(input.buffer);

      const text = result.text.trim();

      if (!text) {
        throw new BadRequestException(
          "No extractable text found. This PDF may require OCR.",
        );
      }

      const sections = text
        .split(/\f/)
        .map((pageText, index) => ({
          text: pageText.trim(),
          pageNumber: index + 1,
        }))
        .filter((section) => section.text.length > 0);

      return {
        text,
        metadata: {
          fileName: input.fileName,
          pageCount: result.numpages,
          parser: this.metadata.id,
          parserVersion: this.metadata.version,
        },
        sections,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException("Failed to parse PDF document");
    }
  }
}
