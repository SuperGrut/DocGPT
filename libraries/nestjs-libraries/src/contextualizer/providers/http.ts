import { ContextualizerRequestError } from "@docgpt/nestjs-libraries/contextualizer/contextualizer.interface";

const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 120_000; // local models can be slow
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST JSON with retries on 429, 5xx and network errors. Throws ContextualizerRequestError otherwise. */
export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send<T>(url, headers, body);
    } catch (e) {
      if (
        !(e instanceof ContextualizerRequestError) ||
        !e.retryable ||
        attempt >= MAX_ATTEMPTS
      ) {
        throw e;
      }
      const backoff =
        Math.min(8_000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
      await sleep(e.retryAfterMs ?? backoff);
    }
  }
}

async function send<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ContextualizerRequestError(
      `Contextualizer request failed: ${(e as Error).message}`,
      undefined,
      true,
    );
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ContextualizerRequestError(
      `Contextualizer API returned ${res.status}: ${detail}`,
      res.status,
      res.status === 429 || res.status >= 500,
      res.status === 401 || res.status === 403 || res.status === 404,
      retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : undefined,
    );
  }

  return (await res.json()) as T;
}
