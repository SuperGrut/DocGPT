import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { FileStorageService } from "@docgpt/nestjs-libraries/storage/storage.service";
import { buildDocumentKey } from "@docgpt/nestjs-libraries/storage/storage.utils";
import { DocumentRepository } from "@docgpt/nestjs-libraries/database/prisma/document/document.repository";

const UPLOAD_URL_TTL_SEC = 15 * 60;
const DOWNLOAD_URL_TTL_SEC = 5 * 60;

@Injectable()
export class DocumentService {
  constructor(
    private readonly _documentRepository: DocumentRepository,
    private readonly fileStorage: FileStorageService,
    private readonly config: ConfigService,
  ) {}

  private get maxBytes(): number {
    return this.config.get<number>("MAX_UPLOAD_BYTES") ?? 25 * 1024 * 1024;
  }

  async requestUpload(
    orgId: string,
    file: { fileName: string; mimeType: string; sizeBytes: number },
  ) {
    if (file.sizeBytes <= 0 || file.sizeBytes > this.maxBytes) {
      throw new BadRequestException(`File must be 1 to ${this.maxBytes} bytes`);
    }

    const key = buildDocumentKey(orgId, documentId);

    const document = await this._documentRepository.create({
      orgId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      storageProvider: this.fileStorage.getWriteProviderName(),
      storageKey: key,
    });

    const target = await this.fileStorage.createUploadUrl({
      key,
      contentType: file.mimeType,
      maxBytes: file.sizeBytes,
      expiresInSec: UPLOAD_URL_TTL_SEC,
    });

    return { documentId: document.id, upload: target };
  }

  /** Step 2: client says the upload finished. Verify against storage, don't trust the client. */
  async completeUpload(documentId: string, userId: string) {
    const document = await this.findOwned(documentId, userId);

    const info = await this.fileStorage.stat(document, document.storageKey);
    if (!info) {
      throw new BadRequestException("File has not been uploaded");
    }

    if (info.sizeBytes > this.maxBytes) {
      await this.fileStorage.delete(document, document.storageKey);
      await this.prisma.document.delete({ where: { id: document.id } });
      throw new BadRequestException("File exceeds the size limit");
    }

    return this.prisma.document.update({
      where: { id: document.id },
      data: { status: "READY", sizeBytes: info.sizeBytes },
    });
  }

  async getDownloadUrl(documentId: string, userId: string) {
    const document = await this.findOwned(documentId, userId);

    return this.fileStorage.createDownloadUrl(document, document.storageKey, {
      expiresInSec: DOWNLOAD_URL_TTL_SEC,
      fileName: document.fileName,
    });
  }

  async deleteDocument(documentId: string, userId: string) {
    const document = await this.findOwned(documentId, userId);

    // Storage first (idempotent), then the row, so a failure never leaves an orphaned file.
    await this.fileStorage.delete(document, document.storageKey);
    await this.prisma.document.delete({ where: { id: document.id } });
  }

  private async findOwned(documentId: string, userId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }
}
