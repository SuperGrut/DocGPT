import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsNotEmpty, IsString, Max, Min } from "class-validator";
import { DocumentService } from "@docgpt/nestjs-libraries/database/prisma/document/document.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { GetOrgFromRequest } from "@docgpt/nestjs-libraries/user/org.from.request";
import { RequestUploadDto } from "@docgpt/nestjs-libraries/dtos/document/request.upload.dto";
import { Organization } from "@prisma/client";

@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post()
  requestUpload(
    @GetOrgFromRequest() org: Organization,
    @Body() body: RequestUploadDto,
  ) {
    return this.documentService.requestUpload(orgId, body);
  }

  /** Step 2: confirm the browser finished uploading. */
  @Post(":documentId/complete")
  @HttpCode(HttpStatus.OK)
  completeUpload(
    @CurrentUser("orgId") orgId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documentService.completeUpload(documentId, orgId);
  }

  @Get()
  list(@CurrentUser("orgId") orgId: string) {
    return this.documentService.list(orgId);
  }

  @Get(":documentId")
  get(
    @CurrentUser("orgId") orgId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documentService.get(documentId, orgId);
  }

  /** Returns a short-lived signed URL. The browser downloads straight from storage. */
  @Get(":documentId/download-url")
  async downloadUrl(
    @CurrentUser("orgId") orgId: string,
    @Param("documentId") documentId: string,
  ) {
    const url = await this.documentService.getDownloadUrl(documentId, orgId);
    return { url };
  }

  @Delete(":documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser("orgId") orgId: string,
    @Param("documentId") documentId: string,
  ) {
    await this.documentService.deleteDocument(documentId, orgId);
  }
}
