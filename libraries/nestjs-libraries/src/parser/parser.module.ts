import { FactoryProvider, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DOCUMENT_PARSERS, DocumentParser } from "../ports/parser.port";
import { DocxParser } from "./docx.parser";
import { PdfParser } from "./pdf.parser";
import { ParserRegistry } from "./parser.registry";

/**
 * Every parser the code base knows about, by id. THE place to add a format:
 *   1. write XlsxParser implements DocumentParser
 *   2. add   xlsx: () => new XlsxParser()   below
 *   3. set   PARSERS_ENABLED=pdf,docx,xlsx
 * Parsers that need Nest dependencies can become normal providers; inject them into the factory instead of calling new.
 */
export const AVAILABLE_PARSERS: Record<string, () => DocumentParser> = {
  pdf: () => new PdfParser(),
  docx: () => new DocxParser(),
};

const documentParsersProvider: FactoryProvider<DocumentParser[]> = {
  provide: DOCUMENT_PARSERS,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => {
    const enabled = (cfg.get<string>("PARSERS_ENABLED") ?? "pdf,docx")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return enabled.map((id) => {
      const make = AVAILABLE_PARSERS[id];
      if (!make)
        throw new Error(
          `Unknown parser '${id}' in PARSERS_ENABLED. Known: ${Object.keys(AVAILABLE_PARSERS).join(", ")}`,
        );
      return make();
    });
  },
};

/** A feature flag per format: ship a new parser switched off, enable it with one env value. */
@Module({
  providers: [documentParsersProvider, ParserRegistry],
  exports: [ParserRegistry],
})
export class ParserModule {}
