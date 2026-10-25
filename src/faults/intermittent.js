/**
 * @file Intermittent fault evaluator using deterministic PRNG.
 * @module faultkit/faults/intermittent
 */

/**
 * Evaluates whether an intermittent fault should trigger based on configured rate and PRNG.
 *
 * @param {object} faultConfig
 * @param {number} faultConfig.rate - Probability of failure (0.0 to 1.0).
 * @param {object} faultConfig.fault - Target fault to execute when triggered.
 * @param {() => number} prng - Deterministic PRNG float generator.
 * @returns {{ triggered: boolean, targetFault: object | null, roll: number }}
 */
export function evaluateIntermittent(faultConfig, prng) {
  const roll = prng();
  const triggered = roll < faultConfig.rate;

  return {
    triggered,
    targetFault: triggered ? faultConfig.fault : null,
    roll
  };
}
