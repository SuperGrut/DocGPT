import {
  Block,
  DocumentLoader,
  Loader,
  LoadedDocument,
  LoaderInput,
} from "@docgpt/nestjs-libraries/loader/loader.interface";
import {
  CorruptFileError,
  EncryptedFileError,
  MIME_PDF,
  NoExtractableTextError,
  TooManyPagesError,
} from "@docgpt/nestjs-libraries/loader/loader.utils";

/**
 * v1: text only, one block per page.
 * Tables and images are in the Block contract but not extracted yet.
 * Scanned PDFs (no text layer) fail with NoExtractableTextError; there is no OCR yet.
 */
@Loader({ mimeTypes: [MIME_PDF] })
export class PdfLoaderProvider extends DocumentLoader {
  readonly name = "pdf";
  readonly version = "1.0.0";

  async load({ buffer, maxPages }: LoaderInput): Promise<LoadedDocument> {
    // unpdf is ESM-only, so import it lazily.
    const { getDocumentProxy, extractText } = await import("unpdf");

    let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
    try {
      // Copy into a fresh Uint8Array: pdf.js may detach the buffer it is given.
      pdf = await getDocumentProxy(new Uint8Array(buffer));
    } catch (e) {
      if ((e as { name?: string })?.name === "PasswordException") {
        throw new EncryptedFileError("PDF is password protected");
      }
      throw new CorruptFileError("PDF could not be parsed");
    }

    if (pdf.numPages > maxPages) {
      throw new TooManyPagesError(
        `PDF has ${pdf.numPages} pages, limit is ${maxPages}`,
      );
    }

    const { text } = await extractText(pdf, { mergePages: false });

    const blocks: Block[] = [];
    text.forEach((pageText, i) => {
      const trimmed = pageText.trim();
      if (trimmed) {
        blocks.push({
          type: "text",
          order: blocks.length,
          page: i + 1,
          text: trimmed,
        });
      }
    });

    if (blocks.length === 0) {
      throw new NoExtractableTextError(
        "PDF has no extractable text (scanned document? OCR is not supported yet)",
      );
    }

    return {
      blocks,
      metadata: { pageCount: pdf.numPages },
      loaderName: this.name,
      loaderVersion: this.version,
    };
  }
}
