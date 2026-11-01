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
  StorageNotFoundError,
  StorageObjectInfo,
  StorageProvider,
  UploadTarget,
} from "../ports/storage.port";
import { assertValidStorageKey, contentDisposition } from "./storage.utils";

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
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly signer: S3Client;

  constructor(
    readonly name: string,
    private readonly cfg: S3StorageConfig,
  ) {
    const base = {
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle ?? false,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      // Recent SDK versions add CRC32 checksum headers by default. Browsers cannot send them on a
      // presigned PUT, and R2/MinIO may reject them, so only compute checksums when required.
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
      responseChecksumValidation: "WHEN_REQUIRED" as const,
    };
    this.client = new S3Client({ ...base, endpoint: cfg.endpoint });
    this.signer = new S3Client({
      ...base,
      endpoint: cfg.publicEndpoint ?? cfg.endpoint,
    });
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
