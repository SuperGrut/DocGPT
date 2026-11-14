import {
  DocumentLoader,
  Loader,
  LoadedDocument,
  LoaderInput,
} from "@docgpt/nestjs-libraries/loader/loader.interface";
import {
  MIME_TEXT,
  NoExtractableTextError,
} from "@docgpt/nestjs-libraries/loader/loader.utils";

@Loader({ mimeTypes: [MIME_TEXT] })
export class TxtLoaderProvider extends DocumentLoader {
  readonly name = "txt";
  readonly version = "1.0.0";

  async load({ buffer }: LoaderInput): Promise<LoadedDocument> {
    const text = new TextDecoder("utf-8")
      .decode(buffer)
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n");

    // One block per paragraph; the chunker decides how to merge or split them.
    const blocks = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p, i) => ({ type: "text" as const, order: i, text: p }));

    if (blocks.length === 0) {
      throw new NoExtractableTextError("Text file is empty");
    }

    return {
      blocks,
      metadata: {},
      loaderName: this.name,
      loaderVersion: this.version,
    };
  }
}
