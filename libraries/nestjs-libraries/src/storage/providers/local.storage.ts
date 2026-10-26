import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  FileStorageProvider,
  UploadFileInput,
  StoredFile,
} from "@docgpt/nestjs-libraries/storage/storage.provider.interface";

@Injectable()
export class LocalStorageProvider implements FileStorageProvider {
  readonly name = "LOCAL";

  private readonly root = path.resolve(
    process.env.LOCAL_STORAGE_PATH ?? "./uploads",
  );

  private resolveKey(key: string): string {
    const resolved = path.resolve(this.root, key);

    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error("Invalid storage key");
    }

    return resolved;
  }

  async upload(input: UploadFileInput): Promise<StoredFile> {
    const destination = this.resolveKey(input.key);

    await fs.mkdir(path.dirname(destination), {
      recursive: true,
    });

    await fs.writeFile(destination, input.buffer, {
      flag: "wx",
    });

    return {
      key: input.key,
      size: input.buffer.length,
    };
  }

  async download(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}
