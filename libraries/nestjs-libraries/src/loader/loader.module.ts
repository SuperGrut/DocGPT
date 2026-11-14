import { Module } from "@nestjs/common";

import { StorageModule } from "@docgpt/nestjs-libraries/storage/storage.module";

import { LoaderService } from "@docgpt/nestjs-libraries/loader/loader.service";
import { LoaderManager } from "@docgpt/nestjs-libraries/loader/providers/loader.manager";
import { PdfLoaderProvider } from "@docgpt/nestjs-libraries/loader/providers/pdf.loader.provider";
import { TxtLoaderProvider } from "@docgpt/nestjs-libraries/loader/providers/txt.loader.provider";

// Importing the provider files here is what runs their @Loader decorators.
@Module({
  imports: [StorageModule],
  providers: [
    LoaderManager,
    LoaderService,
    PdfLoaderProvider,
    TxtLoaderProvider,
  ],
  exports: [LoaderService, LoaderManager],
})
export class LoaderModule {}
