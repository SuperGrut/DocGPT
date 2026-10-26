export interface ParserMetadata {
  id: string;
  supportedMimeTypes: string[];
  supportedExtensions: string[];
  version: string;
}

export interface ParsedContent {
  text: string;
  metadata: Record<string, unknown>;
  sections: ParsedSection[];
}

export interface ParsedSection {
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface DocumentParser {
  readonly metadata: ParserMetadata;

  supports(input: {
    fileName: string;
    mimeType: string;
  }): boolean;

  parse(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<ParsedContent>;
}