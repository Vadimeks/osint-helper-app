// src/lib/http.ts
// Simple fetch wrapper with retries, timeout and proper typing.

export type FetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  retries?: number;
  timeoutMs?: number;
  baseUrl?: string;
};

const defaultOptions = { retries: 2, timeoutMs: 15000 };

/**
 * fetchJson - typed wrapper around fetch returning parsed JSON of type T
 * - path can be absolute URL or relative path (baseUrl will be prepended)
 * - options.body will be JSON.stringified when provided
 * - retries with exponential backoff for 429 and 5xx
 * - supports timeout via AbortController (timeoutMs)
 */
export async function fetchJson<T = unknown>(
  path: string,
  opts: FetchOptions = {}
): Promise<T> {
  const {
    method = "GET",
    headers = {},
    body,
    retries = defaultOptions.retries,
    timeoutMs = defaultOptions.timeoutMs,
    baseUrl = "",
  } = opts;

  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const signal = controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const status = res.status;
        // retry for 429 and 5xx
        if (
          (status === 429 || (status >= 500 && status < 600)) &&
          attempt < retries
        ) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 250 + Math.random() * 200;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`HTTP ${status}: ${text}`);
      }

      // try parse JSON, but allow empty body
      const text = await res.text().catch(() => "");
      if (!text) {
        // No body
        return undefined as unknown as T;
      }
      const json = JSON.parse(text) as T;
      return json;
    } catch (err) {
      clearTimeout(timeoutId);

      // If aborted by timeout
      if ((err as Error)?.name === "AbortError") {
        // if we can retry, do exponential backoff then retry
        if (attempt < retries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 250 + Math.random() * 200;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new Error("Request timeout");
      }

      // other network errors: retry if attempts left
      if (attempt < retries) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 250 + Math.random() * 200;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // no retries left — rethrow
      throw err;
    }
  }
}
