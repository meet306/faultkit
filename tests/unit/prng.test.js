import { describe, it, expect } from "vitest";
import { createPRNG } from "../../src/prng/seed.js";
import { ValidationError } from "../../src/errors/faultkit-error.js";

describe("Deterministic PRNG (Mulberry32)", () => {
  it("should produce the exact same sequence given the same seed", () => {
    const prng1 = createPRNG(42);
    const prng2 = createPRNG(42);

    const sequence1 = [prng1(), prng1(), prng1(), prng1(), prng1()];
    const sequence2 = [prng2(), prng2(), prng2(), prng2(), prng2()];

    expect(sequence1).toEqual(sequence2);
  });

  it("should produce different sequences given different seeds", () => {
    const prng1 = createPRNG(1);
    const prng2 = createPRNG(2);

    expect(prng1()).not.toEqual(prng2());
  });

  it("should output numbers strictly within [0, 1)", () => {
    const prng = createPRNG(999);
    for (let i = 0; i < 1000; i++) {
      const val = prng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it("should throw ValidationError if seed is invalid", () => {
    // @ts-ignore
    expect(() => createPRNG("invalid")).toThrow(ValidationError);
    expect(() => createPRNG(NaN)).toThrow(ValidationError);
    expect(() => createPRNG(Infinity)).toThrow(ValidationError);
  });
});
