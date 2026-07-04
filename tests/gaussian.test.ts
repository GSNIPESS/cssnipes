import { describe, expect, it } from "vitest";
import { erf, normCdf, normPdf } from "@/analytics/gaussian";

describe("gaussian", () => {
  it("erf reference values", () => {
    expect(erf(0)).toBeCloseTo(0, 7);
    expect(erf(1)).toBeCloseTo(0.8427008, 5);
    expect(erf(-1)).toBeCloseTo(-0.8427008, 5);
    expect(erf(3)).toBeCloseTo(0.9999779, 5);
  });

  it("normal cdf/pdf reference values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 8);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normPdf(0)).toBeCloseTo(0.3989423, 6);
  });
});
