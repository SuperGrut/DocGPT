import { Injectable } from "@nestjs/common";
import { StorageProvider } from "@prisma/client";  //add enum here!

import { StorageProviderInterface } from "@docgpt/nestjs-libraries/storage/storage.provider.interface";
import { LocalStorageProvider } from "@docgpt/nestjs-libraries/storage/providers/local.storage";
import { AwsS3StorageProvider } from "@docgpt/nestjs-libraries/storage/providers/s3.storage";
import { GoogleCloudStorageProvider } from "@docgpt/nestjs-libraries/storage/providers/google.cloud.storage";

@Injectable()
export class StorageProviderRegistry {
  private readonly providers: Map<StorageProvider, StorageProviderInterface>;

  constructor(
    local: LocalStorageProvider,
    s3: AwsS3StorageProvider,
    googleCloud: GoogleCloudStorageProvider,
  ) {
    this.providers = new Map([
      [StorageProvider.LOCAL, local],
      [StorageProvider.AWS_S3, s3],
      [StorageProvider.GOOGLE_CLOUD, googleCloud],
    ]);
  }

  get(provider: StorageProvider): StorageProviderInterface {
    const implementation = this.providers.get(provider);

    if (!implementation) {
      throw new Error(`Unsupported storage provider: ${provider}`);
    }

    return implementation;
  }
}
