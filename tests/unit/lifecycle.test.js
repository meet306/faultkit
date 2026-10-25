import { describe, it, expect } from "vitest";
import { ResourceTracker } from "../../src/lifecycle/cleanup.js";
import { createAbortError, createTimeoutError, sleep } from "../../src/lifecycle/cancellation.js";

describe("Lifecycle and Resource Management", () => {
  describe("ResourceTracker", () => {
    it("should track and clear timers on dispose", () => {
      const tracker = new ResourceTracker();
      let timerFired = false;

      const timerId = setTimeout(() => {
        timerFired = true;
      }, 50);

      tracker.registerTimer(timerId);
      expect(tracker.timers.has(timerId)).toBe(true);

      const errors = tracker.dispose();
      expect(errors).toHaveLength(0);
      expect(tracker.timers.size).toBe(0);
      expect(tracker.isDisposed).toBe(true);

      // Verify timer did not fire
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(timerFired).toBe(false);
          resolve(undefined);
        }, 70);
      });
    });

    it("should execute registered cleanup callbacks and collect any errors safely", () => {
      const tracker = new ResourceTracker();
      let cleanedUp = false;

      tracker.registerCleanup(() => {
        cleanedUp = true;
      });

      tracker.registerCleanup(() => {
        throw new Error("Cleanup failure");
      });

      const errors = tracker.dispose();
      expect(cleanedUp).toBe(true);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Cleanup failure");
    });

    it("should allow resetting back to clean state", () => {
      const tracker = new ResourceTracker();
      tracker.dispose();
      expect(tracker.isDisposed).toBe(true);

      tracker.reset();
      expect(tracker.isDisposed).toBe(false);
      expect(tracker.timers.size).toBe(0);
      expect(tracker.cleanups.size).toBe(0);
    });
  });

  describe("cancellation helpers", () => {
    it("should create AbortError with custom or default reason", () => {
      const err = createAbortError("Timeout aborted");
      expect(err.name).toBe("AbortError");
      expect(err.message).toBe("Timeout aborted");

      const existingErr = new Error("Custom error");
      expect(createAbortError(existingErr)).toBe(existingErr);
    });

    it("should create TimeoutError", () => {
      const err = createTimeoutError("Operation timed out");
      expect(err.name).toBe("TimeoutError");
      expect(err.message).toBe("Operation timed out");
    });

    it("sleep should resolve when timer finishes", async () => {
      const tracker = new ResourceTracker();
      const start = Date.now();
      await sleep(20, undefined, tracker);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(15);
    });
  });
});
