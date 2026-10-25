/**
 * @file AbortSignal and cancellation utilities.
 * @module faultkit/lifecycle/cancellation
 */

/**
 * Creates a standard DOMException for an aborted operation.
 * @param {any} [reason] - Abort reason if provided.
 * @returns {Error} DOMException with name 'AbortError'.
 */
export function createAbortError(reason) {
  if (reason instanceof Error) {
    return reason;
  }
  const message = typeof reason === "string" ? reason : "The operation was aborted";
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

/**
 * Creates a standard DOMException for a timeout operation.
 * @param {string} [message="The operation timed out"]
 * @returns {Error} DOMException with name 'TimeoutError'.
 */
export function createTimeoutError(message = "The operation timed out") {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "TimeoutError");
  }
  const err = new Error(message);
  err.name = "TimeoutError";
  return err;
}

/**
 * Sleeps for a given duration in milliseconds, respecting an AbortSignal and resource tracker.
 *
 * @param {number} ms - Milliseconds to sleep.
 * @param {AbortSignal} [signal] - Optional AbortSignal to cancel sleep.
 * @param {import("./cleanup.js").ResourceTracker} [tracker] - Optional tracker for lifecycle cleanup.
 * @returns {Promise<void>}
 */
export function sleep(ms, signal, tracker) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(createAbortError(signal.reason));
    }

    /** @type {{ id: ReturnType<typeof setTimeout> | null }} */
    const handle = { id: null };

    const cleanup = () => {
      if (handle.id !== null) {
        clearTimeout(handle.id);
        tracker?.unregisterTimer(handle.id);
        handle.id = null;
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    const onAbort = () => {
      cleanup();
      reject(createAbortError(signal?.reason));
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    handle.id = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    if (tracker) {
      tracker.registerTimer(handle.id);
    }
  });
}
