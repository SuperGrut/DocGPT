/**
 * Machine-readable reasons a document could not be processed.
 * Stored on Document.failureCode so the UI can show a helpful message
 * ('this PDF is a scan') instead of a raw error string.
 */
export type FailureCode =
  | "CORRUPT"
  | "PASSWORD_PROTECTED"
  | "LEGACY_OR_ENCRYPTED"
  | "SCANNED_PDF"
  | "EMPTY"
  | "TOO_MANY_PAGES"
  | "TOO_MUCH_TEXT"
  | "TIMEOUT"
  | "UNKNOWN";

/**
 * Thrown by parsers and the worker pipeline. `retryable` tells the worker what to do:
 *  - false: mark the document FAILED with this code (retrying the same bytes cannot help)
 *  - true:  put it back in the queue (the failure was in a dependency, for example a network error)
 * Parser errors are never retryable.
 */
export class ProcessingError extends Error {
  constructor(
    readonly code: FailureCode,
    message?: string,
    readonly retryable = false,
  ) {
    super(message ?? code);
    this.name = "ProcessingError";
  }
}
