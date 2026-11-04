import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";

import { FileStorageService } from "../../file-storage/file-storage.service";

import {
  DocumentLoader,
  LoadDocumentInput,
  LoadedDocument,
} from "../interfaces/document-loader.interface";

@Injectable()
export class StoredFileLoader implements DocumentLoader {
  private readonly logger = new Logger(StoredFileLoader.name);

  readonly name = "stored-file";

  constructor(private readonly fileStorageService: FileStorageService) {}

  supports(input: LoadDocumentInput): boolean {
    return Boolean(input.storageProvider && input.storageKey);
  }

  async load(input: LoadDocumentInput): Promise<LoadedDocument> {
    this.logger.log(
      `Loading document ${input.documentId} from ${input.storageProvider}`,
    );

    try {
      const buffer = await this.fileStorageService.download(
        input.storageProvider,
        input.storageKey,
      );

      if (!Buffer.isBuffer(buffer)) {
        throw new Error("Storage provider did not return a valid Buffer");
      }

      if (buffer.length === 0) {
        throw new Error("The stored document is empty");
      }

      return {
        documentId: input.documentId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        buffer,
        size: buffer.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to load document ${input.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException(
        `Unable to load document ${input.documentId}`,
      );
    }
  }
}
