import { Injectable } from "@nestjs/common";
import { Storage } from "@google-cloud/storage";

import {
  StorageProviderInterface,
  UploadFileInput,
  StoredFile,
} from "@docgpt/nestjs-libraries/storage/storage.provider.interface";

@Injectable()
export class GoogleCloudStorageProvider implements StorageProviderInterface {
  readonly name = "GOOGLE_CLOUD";

  private readonly storage = new Storage();
  private readonly bucket = this.storage.bucket(process.env.GCS_BUCKET!);

  async upload(input: UploadFileInput): Promise<StoredFile> {
    await this.bucket.file(input.key).save(input.buffer, {
      resumable: false,
      metadata: {
        contentType: input.contentType,
      },
    });

    return {
      key: input.key,
      size: input.buffer.length,
    };
  }

  async download(key: string): Promise<Buffer> {
    const [contents] = await this.bucket.file(key).download();
    return contents;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({
      ignoreNotFound: true,
    });
  }
}
