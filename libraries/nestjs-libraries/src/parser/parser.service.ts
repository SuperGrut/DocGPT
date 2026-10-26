import { ParsedContent } from "./parser.interface";
import { ParserRegistry } from "./parser.registry";

export class DocumentParsingService {
  constructor(private readonly registry: ParserRegistry) {}

  async parseDocument(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<ParsedContent> {
    const parser = this.registry.getParser(input);
    return parser.parse(input);
  }
}
