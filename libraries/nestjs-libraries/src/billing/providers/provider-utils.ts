import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { Interval } from "../plans/plans.catalog";
import { ProviderError, WebhookHeaders } from "./payment-provider.interface";

const TIMEOUT_MS = 20_000;

export async function requestJson<T>(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
): Promise<T> {
  const host = new URL(url).host;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ProviderError(
      `Request to ${host} failed: ${(e as Error).message}`,
    );
  }
  const text = await res.text();
  if (!res.ok)
    throw new ProviderError(
      `${host} returned ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  return (text ? JSON.parse(text) : {}) as T;
}

/** Stripe's form encoding: nested objects become a[b], arrays become a[0]. */
export function formEncode(params: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, `${key}[${k}]`);
    } else
      out.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      );
  };
  for (const [k, v] of Object.entries(params)) walk(v, k);
  return out.join("&");
}

export function header(
  headers: WebhookHeaders,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export const hmac = (
  key: string | Buffer,
  data: string | Buffer,
  encoding: "hex" | "base64",
) => createHmac("sha256", key).update(data).digest(encoding);

export const sha256Hex = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const unixToDate = (seconds?: number | null): Date | null =>
  typeof seconds === "number" ? new Date(seconds * 1000) : null;

export function asInterval(value: unknown): Interval | null {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  return s === "month" || s === "year" ? s : null;
}

/** Razorpay returns [] instead of {} for empty notes. */
export function asStringRecord(value: unknown): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}
