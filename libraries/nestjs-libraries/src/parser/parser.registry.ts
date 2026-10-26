import { DocumentParser, ParserMetadata } from "./parser.interface";

export class ParserRegistry {
  private readonly parsers = new Map<string, DocumentParser>();

  register(parser: DocumentParser): void {
    const id = parser.metadata.id;

    if (this.parsers.has(id)) {
      throw new Error(`Parser already registered: ${id}`);
    }

    this.parsers.set(id, parser);
  }

  getParser(input: { fileName: string; mimeType: string }): DocumentParser {
    const matches = [...this.parsers.values()].filter((parser) =>
      parser.supports(input),
    );

    if (matches.length === 0) {
      throw new Error("Unsupported document format");
    }

    if (matches.length > 1) {
      throw new Error("Multiple parsers matched this document");
    }

    return matches[0];
  }

  listSupportedFormats(): ParserMetadata[] {
    return [...this.parsers.values()].map((parser) => parser.metadata);
  }
}
