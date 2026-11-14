import type { Readable } from "node:stream";

/** Every LoaderError is permanent: retrying the same file will fail the same way. */
export class LoaderError extends Error {
  readonly nonRetryable = true;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class UnsupportedFileTypeError extends LoaderError {}
export class FileTypeMismatchError extends LoaderError {}
export class FileTooLargeError extends LoaderError {}
export class TooManyPagesError extends LoaderError {}
export class CorruptFileError extends LoaderError {}
export class EncryptedFileError extends LoaderError {}
export class NoExtractableTextError extends LoaderError {}

export const MIME_PDF = "application/pdf";
export const MIME_TEXT = "text/plain";

const TEXT_EXTENSIONS = [".txt", ".text"];

/**
 * Detects the real type from the bytes, never from the client-declared MIME type.
 * Returns null when the type is not recognised.
 */
export function detectMime(buffer: Buffer, fileName: string): string | null {
  // The PDF spec allows the header anywhere in the first 1024 bytes.
  if (buffer.subarray(0, 1024).includes("%PDF-")) return MIME_PDF;

  const name = fileName.toLowerCase();
  const looksTextual = !buffer.subarray(0, 8192).includes(0x00);
  if (looksTextual && TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return MIME_TEXT;
  }

  return null;
}

/** Throws if the client-declared MIME type contradicts the detected one. */
export function assertDeclaredMatches(detected: string, declared?: string) {
  const normalized = (declared ?? "").split(";")[0].trim().toLowerCase();
  if (!normalized || normalized === "application/octet-stream") return;
  if (normalized !== detected) {
    throw new FileTypeMismatchError(
      `Declared type '${normalized}' does not match detected type '${detected}'`,
    );
  }
}

/** Reads a stream into memory, aborting as soon as it exceeds maxBytes. */
export async function readToBuffer(
  stream: Readable,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new FileTooLargeError(`File exceeds ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
