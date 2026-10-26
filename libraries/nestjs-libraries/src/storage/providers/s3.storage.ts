import { Injectable } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import {
  StorageProviderInterface,
  UploadFileInput,
  StoredFile,
} from "@docgpt/nestjs-libraries/storage/storage.provider.interface";

@Injectable()
export class AwsS3StorageProvider implements StorageProviderInterface {
  readonly name = "AWS_S3";

  private readonly client = new S3Client({
    region: process.env.AWS_REGION!,
  });

  private readonly bucket = process.env.AWS_S3_BUCKET!;

  async upload(input: UploadFileInput): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.contentType,
      }),
    );

    return {
      key: input.key,
      size: input.buffer.length,
    };
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("File body not found");
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
