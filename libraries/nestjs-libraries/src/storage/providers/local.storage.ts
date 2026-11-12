import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  StorageAdapter,
  StorageNotFoundError,
  StorageObjectInfo,
  StorageProvider,
  UploadTarget,
} from "@docgpt/nestjs-libraries/storage/provider.interface";
import {
  InvalidStorageKeyError,
  assertValidStorageKey,
} from "../storage.utils";
import {
  LocalTokenClaims,
  LocalTokenKind,
  signLocalToken,
  verifyLocalToken,
} from "./signed-token";

export interface LocalStorageConfig {
  /** Directory that holds the files. */
  baseDir: string;
  /** Public URL of the API, for example http://localhost:4000. The signed URLs point here. */
  publicBaseUrl: string;
  /** HMAC secret for the signed URLs, at least 32 characters. */
  secret: string;
}

export class PayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Upload exceeds ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

const isNotFound = (e: unknown) =>
  (e as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * Development adapter: files on local disk, "presigned" URLs served by LocalStorageController.
 * It exists so you can run the whole upload flow without a cloud account.
 * Do not use it in production (the module refuses to start it there by default).
 */
@StorageAdapter({ provider: "local" })
export class LocalStorageProvider extends StorageProvider {
  readonly name = "local";

  private _cfg?: LocalStorageConfig;
  private _root?: string;

  constructor(private readonly config: ConfigService) {
    super();
  }

  /** Resolved on first use, so apps that don't enable "local" never need its env vars. */
  private get cfg(): LocalStorageConfig {
    if (!this._cfg) {
      const secret = this.config.get<string>("STORAGE_LOCAL_SECRET") ?? "";
      if (secret.length < 32) {
        throw new Error("STORAGE_LOCAL_SECRET must be at least 32 characters");
      }
      this._cfg = {
        baseDir: this.config.getOrThrow<string>("STORAGE_LOCAL_DIR"),
        publicBaseUrl: this.config.getOrThrow<string>("API_PUBLIC_URL"),
        secret,
      };
    }
    return this._cfg;
  }

  private get root(): string {
    return (this._root ??= resolve(this.cfg.baseDir));
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTarget> {
    assertValidStorageKey(input.key);
    const token = signLocalToken(
      {
        kind: "upload",
        key: input.key,
        contentType: input.contentType,
        maxBytes: input.maxBytes,
        exp: nowSec() + input.expiresInSec,
      },
      this.cfg.secret,
    );
    return {
      url: `${this.cfg.publicBaseUrl}/storage/local/upload/${token}`,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
    };
  }

  async stat(key: string): Promise<StorageObjectInfo | null> {
    const path = this.pathFor(key);
    try {
      const info = await stat(path);
      if (!info.isFile()) return null;
      return {
        sizeBytes: info.size,
        contentType: await this.readContentType(path),
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async getStream(key: string): Promise<Readable> {
    return (await this.openForDownload(key)).stream;
  }

  async createDownloadUrl(
    key: string,
    input: CreateDownloadUrlInput,
  ): Promise<string> {
    assertValidStorageKey(key);
    const token = signLocalToken(
      {
        kind: "download",
        key,
        fileName: input.fileName,
        exp: nowSec() + input.expiresInSec,
      },
      this.cfg.secret,
    );
    return `${this.cfg.publicBaseUrl}/storage/local/download/${token}`;
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
  }

  // ---- used by LocalStorageController ----

  verifyToken(token: string, kind: LocalTokenKind): LocalTokenClaims {
    return verifyLocalToken(token, this.cfg.secret, kind);
  }

  /** Streams a request body to disk. Writes to a temp file first, so a failed upload never leaves a partial object. */
  async writeFromStream(
    key: string,
    source: Readable,
    opts: { maxBytes: number; contentType: string },
  ): Promise<number> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomUUID()}.part`;

    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > opts.maxBytes)
          return callback(new PayloadTooLargeError(opts.maxBytes));
        callback(null, chunk);
      },
    });

    try {
      await pipeline(source, limiter, createWriteStream(tmp));
      await rename(tmp, path);
      await writeFile(
        `${path}.meta.json`,
        JSON.stringify({ contentType: opts.contentType }),
      );
      return received;
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  async openForDownload(
    key: string,
  ): Promise<{ stream: Readable; sizeBytes: number; contentType?: string }> {
    const path = this.pathFor(key);
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new StorageNotFoundError(key);
      return {
        stream: createReadStream(path),
        sizeBytes: info.size,
        contentType: await this.readContentType(path),
      };
    } catch (e) {
      if (isNotFound(e)) throw new StorageNotFoundError(key);
      throw e;
    }
  }

  // ---- internals ----

  /** Maps a key to a file path and refuses anything that would escape the base directory. */
  private pathFor(key: string): string {
    assertValidStorageKey(key);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep))
      throw new InvalidStorageKeyError(key);
    return full;
  }

  private async readContentType(path: string): Promise<string | undefined> {
    try {
      const meta = JSON.parse(await readFile(`${path}.meta.json`, "utf8")) as {
        contentType?: string;
      };
      return meta.contentType;
    } catch {
      return undefined;
    }
  }
}
