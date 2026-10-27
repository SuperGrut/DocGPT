import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";

import { DocumentService } from "./document.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  /**
   * Upload a document.
   */
  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @CurrentUser("id") userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentService.uploadDocument(userId, file);
  }

  /**
   * Get all documents belonging to the authenticated user.
   */
  @Get()
  async getUserDocuments(@CurrentUser("id") userId: string) {
    return this.documentService.getUserDocuments(userId);
  }

  /**
   * Get a document by ID.
   */
  @Get(":documentId")
  async getDocument(
    @CurrentUser("id") userId: string,
    @Param("documentId", ParseUUIDPipe)
    documentId: string,
  ) {
    return this.documentService.getDocument(documentId, userId);
  }

  /**
   * Download a document.
   */
  @Get(":documentId/download")
  async downloadDocument(
    @CurrentUser("id") userId: string,
    @Param("documentId", ParseUUIDPipe)
    documentId: string,
    @Res() res: Response,
  ) {
    const result = await this.documentService.downloadDocument(
      documentId,
      userId,
    );

    res.set({
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Length": result.buffer.length,
    });

    return res.send(result.buffer);
  }

  /**
   * Delete a document.
   */
  @Delete(":documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @CurrentUser("id") userId: string,
    @Param("documentId", ParseUUIDPipe)
    documentId: string,
  ) {
    await this.documentService.deleteDocument(documentId, userId);
  }
}
