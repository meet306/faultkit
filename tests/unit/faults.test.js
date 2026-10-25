import { describe, it, expect } from "vitest";
import { simulateHttpError } from "../../src/faults/http-error.js";
import { simulateDelay } from "../../src/faults/delay.js";
import { simulateTimeout } from "../../src/faults/timeout.js";
import { simulateNetworkError } from "../../src/faults/network-error.js";
import { evaluateIntermittent } from "../../src/faults/intermittent.js";
import { ResourceTracker } from "../../src/lifecycle/cleanup.js";

describe("Fault Simulators", () => {
  describe("simulateHttpError", () => {
    it("should return a 500 Response by default", async () => {
      const res = simulateHttpError();
      expect(res.status).toBe(500);
      expect(res.ok).toBe(false);
    });

    it("should return custom status, statusText, and headers", async () => {
      const res = simulateHttpError({
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Retry-After": "120" }
      });
      expect(res.status).toBe(503);
      expect(res.statusText).toBe("Service Unavailable");
      expect(res.headers.get("retry-after")).toBe("120");
    });

    it("should serialize JSON body and set content-type header", async () => {
      const res = simulateHttpError({
        status: 400,
        body: { error: "bad_request", code: 101 }
      });
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toBe("application/json");
      const json = await res.json();
      expect(json).toEqual({ error: "bad_request", code: 101 });
    });

    it("should handle string body and set text/plain header", async () => {
      const res = simulateHttpError({
        status: 502,
        body: "Bad Gateway Error"
      });
      expect(res.status).toBe(502);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const text = await res.text();
      expect(text).toBe("Bad Gateway Error");
    });

    it("should not attach body for 204 or 304 responses", async () => {
      const res204 = simulateHttpError({ status: 204, body: { ignored: true } });
      expect(res204.status).toBe(204);
      expect(res204.body).toBeNull();
    });
  });

  describe("simulateDelay", () => {
    it("should delay and return default 200 response", async () => {
      const tracker = new ResourceTracker();
      const start = Date.now();
      const res = await simulateDelay({ delayMs: 30 }, undefined, tracker);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(25);
      expect(res.status).toBe(200);
    });

    it("should delay and return configured response", async () => {
      const tracker = new ResourceTracker();
      const res = await simulateDelay(
        {
          delayMs: 10,
          response: { status: 504, body: "Gateway Timeout" }
        },
        undefined,
        tracker
      );
      expect(res.status).toBe(504);
      const text = await res.text();
      expect(text).toBe("Gateway Timeout");
    });

    it("should cancel immediately if AbortSignal is already aborted", async () => {
      const tracker = new ResourceTracker();
      const controller = new AbortController();
      controller.abort("User cancelled");

      await expect(simulateDelay({ delayMs: 100 }, controller.signal, tracker)).rejects.toThrow();
    });

    it("should cancel during delay when AbortSignal aborts", async () => {
      const tracker = new ResourceTracker();
      const controller = new AbortController();

      setTimeout(() => {
        controller.abort();
      }, 15);

      await expect(simulateDelay({ delayMs: 100 }, controller.signal, tracker)).rejects.toThrow();
    });
  });

  describe("simulateTimeout", () => {
    it("should throw TimeoutError immediately if timeoutMs is 0", async () => {
      const tracker = new ResourceTracker();
      await expect(simulateTimeout({ timeoutMs: 0 }, undefined, tracker)).rejects.toThrow(
        "Request timed out during fetch simulation"
      );
    });

    it("should throw TimeoutError after delay", async () => {
      const tracker = new ResourceTracker();
      const start = Date.now();
      await expect(
        simulateTimeout({ timeoutMs: 25, message: "Custom timeout" }, undefined, tracker)
      ).rejects.toThrow("Custom timeout");
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(20);
    });
  });

  describe("simulateNetworkError", () => {
    it("should throw TypeError with cause replicating fetch failed", () => {
      try {
        simulateNetworkError({ code: "ECONNRESET" });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
        expect(err.message).toBe("fetch failed");
        expect(err.cause).toBeDefined();
        expect(err.cause.code).toBe("ECONNRESET");
      }
    });
  });

  describe("evaluateIntermittent", () => {
    it("should deterministically trigger fault when roll < rate", () => {
      const mockPrng = () => 0.3; // 30%
      const res = evaluateIntermittent(
        { rate: 0.5, fault: { type: "http-error", status: 503 } },
        mockPrng
      );

      expect(res.triggered).toBe(true);
      expect(res.targetFault).toEqual({ type: "http-error", status: 503 });
    });

    it("should skip fault when roll >= rate", () => {
      const mockPrng = () => 0.7; // 70%
      const res = evaluateIntermittent(
        { rate: 0.5, fault: { type: "http-error", status: 503 } },
        mockPrng
      );

      expect(res.triggered).toBe(false);
      expect(res.targetFault).toBeNull();
    });
  });
});
