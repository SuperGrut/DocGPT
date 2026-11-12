import { Injectable } from "@nestjs/common"; // not needed here; StorageAdapter applies it
import { ConfigService } from "@nestjs/config";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

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
  assertValidStorageKey,
  contentDisposition,
} from "@docgpt/nestjs-libraries/storage/storage.utils";

export interface S3StorageConfig {
  bucket: string;
  /** 'us-east-1', or 'auto' for Cloudflare R2. */
  region: string;
  /** Leave empty for AWS S3. Set for R2 or MinIO, for example https://<account>.r2.cloudflarestorage.com */
  endpoint?: string;
  /**
   * Host the BROWSER can reach, if it differs from the one the API uses (MinIO in Docker:
   * endpoint http://minio:9000, publicEndpoint http://localhost:9000).
   * The host is part of a presigned URL's signature, so URLs must be signed with the public one.
   */
  publicEndpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Needed by MinIO. */
  forcePathStyle?: boolean;
}

/**
 * One class, many backends: AWS S3, Cloudflare R2 and MinIO all speak the S3 protocol.
 * The adapter name is configurable ('s3', 'r2'), so Document.storageProvider tells you which
 * bucket holds a file even when two S3-compatible stores are enabled at the same time.
 */
export abstract class S3CompatibleStorage extends StorageProvider {
  private _cfg?: S3StorageConfig;
  private _client?: S3Client;
  private _signer?: S3Client;

  /** Called on first use, so a disabled backend never needs its env vars. */
  protected abstract loadConfig(): S3StorageConfig;

  protected get cfg(): S3StorageConfig {
    return (this._cfg ??= this.loadConfig());
  }

  private baseOptions() {
    return {
      region: this.cfg.region,
      forcePathStyle: this.cfg.forcePathStyle ?? false,
      credentials: {
        accessKeyId: this.cfg.accessKeyId,
        secretAccessKey: this.cfg.secretAccessKey,
      },
      // (keep your checksum comment here)
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
      responseChecksumValidation: "WHEN_REQUIRED" as const,
    };
  }

  protected get client(): S3Client {
    return (this._client ??= new S3Client({
      ...this.baseOptions(),
      endpoint: this.cfg.endpoint,
    }));
  }

  protected get signer(): S3Client {
    return (this._signer ??= new S3Client({
      ...this.baseOptions(),
      endpoint: this.cfg.publicEndpoint ?? this.cfg.endpoint,
    }));
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTarget> {
    assertValidStorageKey(input.key);
    const command = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.maxBytes,
    });
    // Signing content-type and content-length means S3 rejects an upload whose type or size differs.
    // The browser sets Content-Length itself, so only Content-Type is returned as a header to send.
    const url = await getSignedUrl(this.signer, command, {
      expiresIn: input.expiresInSec,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return {
      url,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
    };
  }

  async stat(key: string): Promise<StorageObjectInfo | null> {
    assertValidStorageKey(key);
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      return {
        sizeBytes: head.ContentLength ?? 0,
        contentType: head.ContentType,
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async getStream(key: string): Promise<Readable> {
    assertValidStorageKey(key);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      if (!(res.Body instanceof Readable))
        throw new Error("Unexpected S3 response body type");
      return res.Body;
    } catch (e) {
      if (isNotFound(e)) throw new StorageNotFoundError(key);
      throw e;
    }
  }

  async createDownloadUrl(
    key: string,
    input: CreateDownloadUrlInput,
  ): Promise<string> {
    assertValidStorageKey(key);
    const command = new GetObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      ResponseContentDisposition: input.fileName
        ? contentDisposition(input.fileName)
        : undefined,
    });
    return getSignedUrl(this.signer, command, {
      expiresIn: input.expiresInSec,
    });
  }

  async delete(key: string): Promise<void> {
    assertValidStorageKey(key);
    // S3 answers 204 whether or not the key existed, so this is idempotent by itself.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
  }
}

function isNotFound(e: unknown): boolean {
  const err = e as
    { name?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  return (
    err?.name === "NotFound" ||
    err?.name === "NoSuchKey" ||
    err?.$metadata?.httpStatusCode === 404
  );
}

@StorageAdapter({ provider: "s3" })
export class S3StorageProvider extends S3CompatibleStorage {
  readonly name = "s3";

  constructor(private readonly config: ConfigService) {
    super();
  }

  protected loadConfig(): S3StorageConfig {
    return {
      bucket: this.config.getOrThrow("S3_BUCKET"),
      region: this.config.getOrThrow("S3_REGION"),
      endpoint: this.config.get("S3_ENDPOINT"),
      publicEndpoint: this.config.get("S3_PUBLIC_ENDPOINT"),
      accessKeyId: this.config.getOrThrow("S3_ACCESS_KEY_ID"),
      secretAccessKey: this.config.getOrThrow("S3_SECRET_ACCESS_KEY"),
      forcePathStyle: this.config.get("S3_FORCE_PATH_STYLE") === "true",
    };
  }
}

@StorageAdapter({ provider: "r2" })
export class R2StorageProvider extends S3CompatibleStorage {
  readonly name = "r2";

  constructor(private readonly config: ConfigService) {
    super();
  }

  protected loadConfig(): S3StorageConfig {
    return {
      bucket: this.config.getOrThrow("R2_BUCKET"),
      region: "auto",
      endpoint: this.config.getOrThrow("R2_ENDPOINT"),
      accessKeyId: this.config.getOrThrow("R2_ACCESS_KEY_ID"),
      secretAccessKey: this.config.getOrThrow("R2_SECRET_ACCESS_KEY"),
    };
  }
}
