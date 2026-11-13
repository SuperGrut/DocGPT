import { Injectable } from "@nestjs/common";
import { PrismaRepository } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import { DocumentStatus } from "@prisma/client";

@Injectable()
export class DocumentRepository {
  constructor(private _document: PrismaRepository<"document">) {}

  create(data: {
    orgId: string;
    fileName: string;
    mimeType: string;
    storageProvider: string;
    storageKey: string;
  }) {
    return this._document.model.document.create({
      data: { ...data, status: DocumentStatus.UPLOADING },
    });
  }
}
