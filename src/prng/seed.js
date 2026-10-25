/**
 * @file Deterministic pseudo-random number generator (Mulberry32).
 * @module faultkit/prng
 */

import { ValidationError } from "../errors/faultkit-error.js";

/**
 * Creates a deterministic Mulberry32 PRNG from a given seed.
 * Produces uniform pseudo-random floats in the half-open interval [0, 1).
 *
 * @param {number} [seed=123456789] - Initial integer seed.
 * @returns {() => number} A function returning a deterministic pseudo-random float between 0 and 1.
 * @throws {ValidationError} If the seed is not a finite number.
 */
export function createPRNG(seed = 123456789) {
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    throw new ValidationError("PRNG seed must be a finite number", { seed });
  }

  // Convert seed to unsigned 32-bit integer
  let state = seed >>> 0 || 123456789;

  return function nextFloat() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
