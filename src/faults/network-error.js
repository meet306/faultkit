/**
 * @file Network error / connection reset simulator.
 * @module faultkit/faults/network-error
 */

/**
 * Simulates a low-level network failure such as ECONNRESET or socket hangup,
 * matching Node.js native fetch failure semantics (TypeError: fetch failed).
 *
 * @param {object} [faultConfig={}]
 * @param {string} [faultConfig.code="ECONNRESET"] - Error code on cause object.
 * @param {string} [faultConfig.message="fetch failed"] - Top-level error message.
 * @param {string} [faultConfig.causeMessage] - Message for underlying cause error.
 * @returns {never}
 * @throws {TypeError}
 */
export function simulateNetworkError(faultConfig = {}) {
  const code = faultConfig.code || "ECONNRESET";
  const message = faultConfig.message || "fetch failed";
  const causeMessage = faultConfig.causeMessage || `read ${code}`;

  const causeError = new Error(causeMessage);
  // @ts-ignore
  causeError.code = code;

  const typeError = new TypeError(message, { cause: causeError });
  throw typeError;
}
