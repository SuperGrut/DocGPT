import type { DocumentSourceKind, SourceOfKind } from "./document-source";
import type { LoadLimits, LoadedDocument } from "./loaded-document";

/** DI token: the list of every enabled DocumentLoader. */
export const DOCUMENT_LOADERS = Symbol("DOCUMENT_LOADERS");

/**
 * Answers "where do the bytes come from". Answering "what format are they" is the parser's job.
 *
 * Contract (every loader must follow it; the tests check it):
 *  - reads at most limits.maxBytes, counting the bytes that actually arrive, and fails with
 *    ProcessingError('FILE_TOO_LARGE') beyond that
 *  - computes the SHA-256 while reading, in the same pass
 *  - never looks inside the file: an empty or corrupt file loads fine, the parser decides about it
 *  - fails ONLY with ProcessingError. `retryable` is true for temporary trouble (network,
 *    throttling) and false for permanent problems (file missing, too large), so the workflow
 *    retries exactly the right failures
 *  - stops promptly when limits.signal is aborted, and releases every stream it opened
 */
export interface DocumentLoader<
  K extends DocumentSourceKind = DocumentSourceKind,
> {
  readonly kind: K;
  load(source: SourceOfKind<K>, limits: LoadLimits): Promise<LoadedDocument>;
}
