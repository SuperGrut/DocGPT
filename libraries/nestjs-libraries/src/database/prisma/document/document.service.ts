import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FileStorageService } from "@docgpt/nestjs-libraries/storage/storage.service";

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  async uploadDocument(
    userId: string,
    file: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
    },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { storageProvider: true },
    });

    const provider =
      user.storageProvider ?? this.fileStorage.getDefaultProvider();

    const stored = await this.fileStorage.upload(
      provider,
      userId,
      file.buffer,
      file.mimetype,
    );

    try {
      return await this.prisma.document.create({
        data: {
          userId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          storageProvider: provider,
          storageKey: stored.key,
        },
      });
    } catch (error) {
      // Compensate if database persistence fails.
      await this.fileStorage.delete(provider, stored.key);
      throw error;
    }
  }

  async downloadDocument(documentId: string, userId: string) {
    const document = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, userId },
    });

    return this.fileStorage.download(
      document.storageProvider,
      document.storageKey,
    );
  }

  async deleteDocument(documentId: string, userId: string) {
    const document = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, userId },
    });

    // Delete the database record only after storage deletion succeeds.
    await this.fileStorage.delete(
      document.storageProvider,
      document.storageKey,
    );

    await this.prisma.document.delete({
      where: { id: document.id },
    });
  }
}
