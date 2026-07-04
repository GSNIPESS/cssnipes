import { RateLimiter, sleep } from "./rate-limit";

export class HttpBlockedError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "HttpBlockedError";
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  requestsPerSecond?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * JSON HTTP client with per-client rate limiting, timeouts, and retries with
 * exponential backoff + jitter. Retries 429 and 5xx (honoring Retry-After);
 * 401/403 and exhausted 429s surface as HttpBlockedError so callers can mark
 * the provider blocked instead of crashing.
 */
export class HttpClient {
  private readonly limiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: HttpClientOptions) {
    this.limiter = new RateLimiter(opts.requestsPerSecond ?? 2);
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async getJson(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.opts.baseUrl);
    for (const [k, v] of Object.entries(params ?? {})) {
      url.searchParams.set(k, v);
    }

    let lastError: Error = new Error("request not attempted");
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.limiter.acquire();
      try {
        const res = await fetch(url, {
          headers: { accept: "application/json", ...this.opts.headers },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (res.ok) return await res.json();

        if (res.status === 401 || res.status === 403) {
          throw new HttpBlockedError(
            `${res.status} ${res.statusText} from ${url.hostname}`,
            res.status
          );
        }

        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`${res.status} ${res.statusText} from ${url.hostname}`);
          if (attempt < this.maxRetries) {
            await sleep(this.backoffMs(attempt, res.headers.get("retry-after")));
            continue;
          }
          if (res.status === 429) {
            throw new HttpBlockedError(`rate limited by ${url.hostname}`, 429);
          }
          throw lastError;
        }

        // Other 4xx: not retryable, not a block — a bug or removed resource.
        throw new Error(`${res.status} ${res.statusText} from ${url.hostname}`);
      } catch (err) {
        if (err instanceof HttpBlockedError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        // Network errors and timeouts are retryable.
        if (attempt < this.maxRetries) {
          await sleep(this.backoffMs(attempt, null));
          continue;
        }
      }
    }
    throw lastError;
  }

  private backoffMs(attempt: number, retryAfter: string | null): number {
    const fromHeader = retryAfter ? Number(retryAfter) * 1000 : NaN;
    if (Number.isFinite(fromHeader) && fromHeader > 0) {
      return Math.min(fromHeader, 60_000);
    }
    const base = 500 * 2 ** attempt;
    return base + Math.random() * base;
  }
}
