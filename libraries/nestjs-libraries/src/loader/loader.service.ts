import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";

import { PrismaService } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import { FileStorageService } from "@docgpt/nestjs-libraries/storage/storage.service";

import {
  LoaderError,
  UnsupportedFileTypeError,
  assertDeclaredMatches,
  detectMime,
  readToBuffer,
} from "@docgpt/nestjs-libraries/loader/loader.utils";
import { LoaderManager } from "@docgpt/nestjs-libraries/loader/providers/loader.manager";

/** The only thing the Temporal `load` activity calls. */
@Injectable()
export class LoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly manager: LoaderManager,
    private readonly config: ConfigService,
  ) {}

  async load(documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new LoaderError(`Document ${documentId} not found`);

    const maxBytes = Number(
      this.config.get("MAX_UPLOAD_BYTES") ?? 25 * 1024 * 1024,
    );
    const maxPages = Number(this.config.get("LOADER_MAX_PAGES") ?? 500);

    const stream = await this.storage.getStream(doc, doc.storageKey);
    const buffer = await readToBuffer(stream, maxBytes);

    const mime = detectMime(buffer, doc.fileName);
    if (!mime) {
      throw new UnsupportedFileTypeError(
        `Unrecognised file type for '${doc.fileName}'`,
      );
    }
    assertDeclaredMatches(mime, doc.mimeType);

    const loaded = await this.manager.forMime(mime).load({
      buffer,
      fileName: doc.fileName,
      docId: doc.id,
      maxPages,
    });

    // Upsert keeps retries and re-runs idempotent.
    const data = loaded as unknown as Prisma.InputJsonValue;
    await this.prisma.documentParse.upsert({
      where: { documentId: doc.id },
      create: {
        documentId: doc.id,
        loaderName: loaded.loaderName,
        loaderVersion: loaded.loaderVersion,
        data,
      },
      update: {
        loaderName: loaded.loaderName,
        loaderVersion: loaded.loaderVersion,
        data,
      },
    });

    // Return a reference only: the next activity reads DocumentParse by documentId.
    return {
      documentId: doc.id,
      blockCount: loaded.blocks.length,
      loaderVersion: loaded.loaderVersion,
    };
  }
}
