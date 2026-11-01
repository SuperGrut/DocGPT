export class InvalidStorageKeyError extends Error {
  constructor(readonly key: string) {
    super(`Invalid storage key: ${JSON.stringify(key)}`);
    this.name = "InvalidStorageKeyError";
  }
}

// Letters, digits, dot, underscore, dash, slash. Must start with a letter or digit.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Every adapter calls this before touching a key, so '../x', '/abs', 'a//b' and 'a/./b'
 * are rejected the same way no matter which backend is active.
 */
export function isValidStorageKey(key: string): boolean {
  if (key.length === 0 || key.length > 512 || !KEY_PATTERN.test(key))
    return false;
  return !key
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
}

export function assertValidStorageKey(key: string): void {
  if (!isValidStorageKey(key)) throw new InvalidStorageKeyError(key);
}

/**
 * The only way DocumentService should build a key: ids only, never the client file name.
 * The orgs/{orgId}/ prefix also lets you delete or migrate one organization's files by prefix.
 */
export function buildDocumentKey(orgId: string, documentId: string): string {
  const key = `orgs/${orgId}/documents/${documentId}/original`;
  assertValidStorageKey(key);
  return key;
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Safe Content-Disposition value for a user-supplied file name (no header injection, UTF-8 aware). */
export function contentDisposition(fileName: string): string {
  const clean = fileName.replace(/[\r\n"\\/]/g, "_").trim() || "document";
  const asciiFallback = clean.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987(clean)}`;
}
