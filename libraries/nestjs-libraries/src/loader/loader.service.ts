import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

import { ProcessingError } from "../../parser/parser.errors";
import { StorageNotFoundError } from "../../ports/storage.port";
import type { StorageProvider } from "../../ports/storage.port";
import { StorageManager } from "../../storage/storage.manager";
import { InvalidStorageKeyError } from "../../storage/storage.utils";
import type { DocumentLoader } from "./document.loader";
import { describeSource } from "./document-source";
import type { SourceOfKind } from "./document-source";
import type { LoadLimits, LoadedDocument } from "./loaded-document";

/**
 * Loads a file from the app's own object storage (local disk, S3, R2...).
 * It asks the StorageManager for the adapter named in the source, so a file uploaded to the
 * old store is still readable after the default store changes.
 */
export class StorageDocumentLoader implements DocumentLoader<"storage"> {
  readonly kind = "storage" as const;

  constructor(private readonly storage: StorageManager) {}

  async load(
    source: SourceOfKind<"storage">,
    limits: LoadLimits,
  ): Promise<LoadedDocument> {
    throwIfAborted(limits.signal);
    const provider = this.providerFor(source);

    try {
      const info = await provider.stat(source.key);
      if (!info) {
        throw new ProcessingError(
          "SOURCE_MISSING",
          `The stored file was not found (${describeSource(source)})`,
        );
      }
      // Cheap early exit: never download a file we already know is too big.
      if (info.sizeBytes > limits.maxBytes) throw tooLarge(limits.maxBytes);

      const stream = await provider.getStream(source.key);
      const { bytes, sha256 } = await readCapped(stream, limits);
      return {
        source,
        bytes,
        sizeBytes: bytes.length,
        sha256,
        contentType: info.contentType,
      };
    } catch (error) {
      throw toProcessingError(error, source, limits.signal);
    }
  }

  private providerFor(source: SourceOfKind<"storage">): StorageProvider {
    try {
      return this.storage.get(source.provider);
    } catch (error) {
      // The document names an adapter that is no longer enabled. Retrying cannot fix that:
      // an operator has to enable the adapter again, then reprocess the document.
      throw new ProcessingError("UNKNOWN", errorText(error));
    }
  }
}

/**
 * Reads the whole stream into memory while hashing it, and stops the moment more than
 * maxBytes have arrived. The size reported by stat() is only a hint: a wrong or changing
 * file must not be able to fill the worker's memory.
 */
async function readCapped(
  stream: Readable,
  limits: LoadLimits,
): Promise<{ bytes: Buffer; sha256: string }> {
  const hash = createHash("sha256");
  const pieces: Buffer[] = [];
  let total = 0;

  // Destroying the stream makes the loop below end at once instead of waiting for the next piece.
  const onAbort = () => stream.destroy();
  limits.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const piece of stream) {
      const buffer: Buffer = Buffer.isBuffer(piece)
        ? piece
        : Buffer.from(piece);
      total += buffer.length;
      if (total > limits.maxBytes) throw tooLarge(limits.maxBytes);
      hash.update(buffer);
      pieces.push(buffer);
    }
  } finally {
    limits.signal?.removeEventListener("abort", onAbort);
    // On every exit path, success or failure, give the connection back.
    stream.destroy();
  }

  throwIfAborted(limits.signal);
  return { bytes: Buffer.concat(pieces, total), sha256: hash.digest("hex") };
}

/** Every failure leaves this loader as a ProcessingError, with `retryable` set correctly. */
function toProcessingError(
  error: unknown,
  source: SourceOfKind<"storage">,
  signal?: AbortSignal,
): ProcessingError {
  if (error instanceof ProcessingError) return error;
  if (signal?.aborted)
    return new ProcessingError("TIMEOUT", "Loading was aborted");

  if (error instanceof StorageNotFoundError) {
    // The file disappeared between the existence check and the read.
    return new ProcessingError(
      "SOURCE_MISSING",
      `The stored file was not found (${describeSource(source)})`,
    );
  }
  if (error instanceof InvalidStorageKeyError) {
    // A bad key is stored data that is wrong. Retrying the same key will never work.
    return new ProcessingError(
      "UNKNOWN",
      `The document has an invalid storage key (${describeSource(source)})`,
    );
  }
  // Anything else (network, throttling, a 5xx) is assumed to be temporary: let the workflow retry.
  return new ProcessingError(
    "SOURCE_UNAVAILABLE",
    `Could not read the stored file (${describeSource(source)}): ${errorText(error)}`,
    true,
  );
}

function tooLarge(maxBytes: number): ProcessingError {
  return new ProcessingError(
    "FILE_TOO_LARGE",
    `The file is larger than the limit of ${describeSize(maxBytes)}`,
  );
}

function describeSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.floor(bytes / (1024 * 1024))} MB`
    : `${bytes} bytes`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new ProcessingError("TIMEOUT", "Loading was aborted");
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
