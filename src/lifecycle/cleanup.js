/**
 * @file Resource tracking and cleanup manager.
 * @module faultkit/lifecycle/cleanup
 */

/**
 * Tracks and safely disposes timers, event listeners, and cancellation handles.
 */
export class ResourceTracker {
  constructor() {
    /** @type {Set<ReturnType<typeof setTimeout>>} */
    this.timers = new Set();
    /** @type {Set<() => void>} */
    this.cleanups = new Set();
    /** @type {boolean} */
    this.isDisposed = false;
  }

  /**
   * Registers a timer ID for automatic tracking.
   * @param {ReturnType<typeof setTimeout>} timerId
   * @returns {ReturnType<typeof setTimeout>}
   */
  registerTimer(timerId) {
    if (this.isDisposed) {
      clearTimeout(timerId);
      return timerId;
    }
    this.timers.add(timerId);
    return timerId;
  }

  /**
   * Unregisters a completed timer ID.
   * @param {ReturnType<typeof setTimeout>} timerId
   */
  unregisterTimer(timerId) {
    this.timers.delete(timerId);
  }

  /**
   * Registers a cleanup callback to be invoked upon disposal.
   * @param {() => void} cleanupFn
   * @returns {() => void} Function to unregister the cleanup.
   */
  registerCleanup(cleanupFn) {
    if (this.isDisposed) {
      try {
        cleanupFn();
      } catch {
        // Suppress during disposed state
      }
      return () => {};
    }
    this.cleanups.add(cleanupFn);
    return () => {
      this.cleanups.delete(cleanupFn);
    };
  }

  /**
   * Clears all tracked timers and executes all registered cleanup callbacks.
   * Safe to call multiple times (idempotent).
   *
   * @returns {Array<Error>} Any errors encountered during cleanup.
   */
  dispose() {
    this.isDisposed = true;
    /** @type {Array<Error>} */
    const errors = [];

    for (const timerId of this.timers) {
      try {
        clearTimeout(timerId);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    this.timers.clear();

    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    this.cleanups.clear();

    return errors;
  }

  /**
   * Resets the tracker back to clean state.
   */
  reset() {
    this.dispose();
    this.isDisposed = false;
  }
}
