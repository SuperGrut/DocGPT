import { Inject, Injectable } from "@nestjs/common";

import { UnsupportedFileTypeError } from "../errors/domain.errors";
import { DOCUMENT_PARSERS, DocumentParser } from "../ports/parser.port";

/**
 * Looks up the parser for a MIME type. DocumentService validates uploads with supports(),
 * the controller exposes supportedMimeTypes() to the file picker, and the worker calls get().
 * Adding a format changes nothing here: enable the parser in parser.module.ts and it shows up everywhere.
 */
@Injectable()
export class ParserRegistry {
  private readonly byMime = new Map<string, DocumentParser>();
  private readonly byId = new Map<string, DocumentParser>();

  constructor(@Inject(DOCUMENT_PARSERS) parsers: DocumentParser[]) {
    for (const parser of parsers) {
      if (this.byId.has(parser.id))
        throw new Error(`Duplicate parser id '${parser.id}'`);
      this.byId.set(parser.id, parser);
      for (const mime of parser.mimeTypes) {
        // Two parsers claiming one MIME type is a configuration mistake: fail at boot, not at upload time.
        if (this.byMime.has(mime))
          throw new Error(`MIME type '${mime}' is claimed by two parsers`);
        this.byMime.set(mime, parser);
      }
    }
  }

  supports(mimeType: string): boolean {
    return this.byMime.has(mimeType);
  }

  get(mimeType: string): DocumentParser {
    const parser = this.byMime.get(mimeType);
    if (!parser) throw new UnsupportedFileTypeError(mimeType);
    return parser;
  }

  /** For code that holds a stored Document.parserId (for example when explaining how chunks were made). */
  getById(id: string): DocumentParser | undefined {
    return this.byId.get(id);
  }

  supportedMimeTypes(): string[] {
    return [...this.byMime.keys()];
  }
}
