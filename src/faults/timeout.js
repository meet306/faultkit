/**
 * @file Timeout fault simulator.
 * @module faultkit/faults/timeout
 */

import { sleep, createTimeoutError } from "../lifecycle/cancellation.js";

/**
 * Simulates a client-side request timeout by pausing (if configured) and throwing a TimeoutError.
 *
 * @param {object} [faultConfig={}]
 * @param {number} [faultConfig.timeoutMs=0] - Milliseconds before throwing timeout.
 * @param {string} [faultConfig.message="Request timed out during fetch simulation"] - Custom error message.
 * @param {AbortSignal} [signal] - Optional request cancellation signal.
 * @param {import("../lifecycle/cleanup.js").ResourceTracker} [tracker] - Resource tracker.
 * @returns {Promise<never>}
 * @throws {Error} DOMException ('TimeoutError' or 'AbortError')
 */
export async function simulateTimeout(faultConfig = {}, signal, tracker) {
  const timeoutMs = faultConfig.timeoutMs ?? 0;
  const message = faultConfig.message || "Request timed out during fetch simulation";

  if (timeoutMs > 0) {
    await sleep(timeoutMs, signal, tracker);
  }

  throw createTimeoutError(message);
}
