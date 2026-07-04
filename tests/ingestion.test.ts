import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/ingestion/core/rate-limit";
import { cs2RecordSchema, slugify } from "@/ingestion/cs2/schema";

describe("slugify", () => {
  it("normalizes names to url-safe slugs", () => {
    expect(slugify("Natus Vincere")).toBe("natus-vincere");
    expect(slugify("  G2 Esports!! ")).toBe("g2-esports");
    expect(slugify("Ninjas in Pyjamas™")).toBe("ninjas-in-pyjamastm");
    expect(slugify("Åland Örns")).toBe("aland-orns");
  });
});

describe("canonical record schema", () => {
  it("accepts a valid match and coerces dates", () => {
    const result = cs2RecordSchema.parse({
      kind: "match",
      externalId: "x:1",
      eventExternalId: "x:e1",
      teamAExternalId: "x:a",
      teamBExternalId: "x:b",
      scheduledAt: "2026-07-01T12:00:00Z",
    });
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.scheduledAt).toBeInstanceOf(Date);
    }
  });

  it("rejects records with missing identity fields", () => {
    expect(
      cs2RecordSchema.safeParse({ kind: "team", externalId: "", name: "X" }).success
    ).toBe(false);
    expect(
      cs2RecordSchema.safeParse({ kind: "player", externalId: "x:1" }).success
    ).toBe(false);
  });
});

describe("rate limiter", () => {
  it("queues acquisitions beyond the burst", async () => {
    const limiter = new RateLimiter(20, 1); // 1 burst, 20 rps → ~50ms spacing
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80); // two waits ≥ ~100ms nominal
  });
});
