import { createHmac, timingSafeEqual } from "node:crypto";

export type LocalTokenKind = "upload" | "download";

export interface LocalTokenClaims {
  kind: LocalTokenKind;
  key: string;
  /** Unix time in seconds. */
  exp: number;
  contentType?: string;
  maxBytes?: number;
  fileName?: string;
}

export class LocalTokenError extends Error {
  constructor(readonly reason: "invalid" | "expired") {
    super(`Local storage token is ${reason}`);
    this.name = "LocalTokenError";
  }
}

const encode = (buf: Buffer) => buf.toString("base64url");

/** token = base64url(claims) + '.' + base64url(HMAC-SHA256(claims)). Same idea as an S3 presigned URL. */
export function signLocalToken(
  claims: LocalTokenClaims,
  secret: string,
): string {
  const payload = encode(Buffer.from(JSON.stringify(claims), "utf8"));
  const signature = encode(
    createHmac("sha256", secret).update(payload).digest(),
  );
  return `${payload}.${signature}`;
}

export function verifyLocalToken(
  token: string,
  secret: string,
  kind: LocalTokenKind,
  nowMs: number = Date.now(),
): LocalTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1])
    throw new LocalTokenError("invalid");

  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const given = Buffer.from(parts[1], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new LocalTokenError("invalid");
  }

  let claims: LocalTokenClaims;
  try {
    claims = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as LocalTokenClaims;
  } catch {
    throw new LocalTokenError("invalid");
  }

  if (
    claims.kind !== kind ||
    typeof claims.key !== "string" ||
    typeof claims.exp !== "number"
  ) {
    throw new LocalTokenError("invalid");
  }
  if (claims.exp * 1000 < nowMs) throw new LocalTokenError("expired");
  return claims;
}
