/**
 * Token-bucket rate limiter. Callers `await limiter.acquire()` before each
 * request; excess calls queue and drain at the configured rate.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly requestsPerSecond: number,
    private readonly burst: number = Math.max(1, Math.ceil(requestsPerSecond))
  ) {
    this.tokens = this.burst;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) / this.requestsPerSecond) * 1000);
      await sleep(Math.max(waitMs, 10));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.requestsPerSecond);
    this.lastRefill = now;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
