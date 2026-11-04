import { Module } from "@nestjs/common";

import { FileStorageModule } from "../../file-storage/file-storage.module";

import { DocumentLoaderService } from "./document-loader.service";
import { StoredFileLoader } from "./providers/stored-file.loader";

@Module({
  imports: [FileStorageModule],
  providers: [StoredFileLoader, DocumentLoaderService],
  exports: [DocumentLoaderService],
})
export class DocumentLoaderModule {}
