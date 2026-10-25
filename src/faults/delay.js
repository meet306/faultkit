/**
 * @file Delay fault simulator with AbortSignal cancellation support.
 * @module faultkit/faults/delay
 */

import { sleep } from "../lifecycle/cancellation.js";
import { simulateHttpError } from "./http-error.js";

/**
 * Simulates a network or processing delay, optionally returning a configured response.
 *
 * @param {object} faultConfig
 * @param {number} faultConfig.delayMs - Milliseconds to delay.
 * @param {object} [faultConfig.response] - Optional response configuration after delay.
 * @param {AbortSignal} [signal] - Optional request cancellation signal.
 * @param {import("../lifecycle/cleanup.js").ResourceTracker} [tracker] - Resource tracker.
 * @returns {Promise<Response>}
 */
export async function simulateDelay(faultConfig, signal, tracker) {
  const delayMs = faultConfig.delayMs || 0;

  if (delayMs > 0) {
    await sleep(delayMs, signal, tracker);
  }

  if (faultConfig.response) {
    return simulateHttpError(faultConfig.response);
  }

  return new Response("OK", { status: 200 });
}
