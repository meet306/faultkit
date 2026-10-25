import { describe, it, expect } from "vitest";
import { createScenario } from "../../src/index.js";

/**
 * Helper simulating an application-level HTTP client with retry logic.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.backoffMs=5]
 */
async function fetchWithRetry(url, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;
    try {
      const response = await fetch(url);
      if (response.ok) {
        return { ok: true, status: response.status, attempts, data: await response.json() };
      }
      if (response.status >= 500 && attempts <= maxRetries) {
        // Transient server error, retry
        continue;
      }
      return { ok: false, status: response.status, attempts, error: await response.text() };
    } catch (err) {
      if (attempts <= maxRetries) {
        continue; // Network or timeout error, retry
      }
      throw err;
    }
  }

  throw new Error("Max retries exceeded");
}

/**
 * Helper simulating application fallback logic.
 *
 * @param {string} url
 * @param {any} fallbackData
 */
async function fetchWithFallback(url, fallbackData) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { source: "fallback", data: fallbackData };
    }
    return { source: "primary", data: await res.json() };
  } catch {
    return { source: "fallback", data: fallbackData };
  }
}

describe("Retry and Fallback Integration Patterns", () => {
  it("should verify retry loop succeeds after 2 transient 503 failures", async () => {
    const scenario = createScenario({
      name: "retry-payment-success",
      rules: [
        {
          match: { hostname: "payments.example.test", pathname: "/charge" },
          fault: {
            type: "http-error",
            status: 503,
            body: { error: "Service temporarily overloaded" }
          },
          times: 2 // Fail twice, then succeed
        },
        {
          match: { hostname: "payments.example.test", pathname: "/charge" },
          fault: {
            type: "http-error",
            status: 200,
            body: { transactionId: "tx_998877", status: "succeeded" }
          },
          times: 1
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      return await fetchWithRetry("https://payments.example.test/charge", { maxRetries: 3 });
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(3);
    expect(result.data.transactionId).toBe("tx_998877");

    expect(report.matchedCount).toBe(3);
    expect(report.faultsTriggered).toBe(3);
    expect(report.rules[0].timesActivated).toBe(2);
    expect(report.rules[0].exhausted).toBe(true);
    expect(report.rules[1].timesActivated).toBe(1);
  });

  it("should verify retry loop exhaustion when failures exceed maxRetries", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "api.inventory.test" },
          fault: { type: "http-error", status: 500, body: "Database down" },
          times: 5
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      return await fetchWithRetry("https://api.inventory.test/items", { maxRetries: 2 });
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.attempts).toBe(3); // Initial + 2 retries
    expect(report.matchedCount).toBe(3);
  });

  it("should verify retry succeeds after network connection drop (ECONNRESET)", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "flaky-network.test" },
          fault: { type: "network-error", code: "ECONNRESET" },
          times: 1
        },
        {
          match: { hostname: "flaky-network.test" },
          fault: { type: "http-error", status: 200, body: { data: "recovered" } },
          times: 1
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      return await fetchWithRetry("https://flaky-network.test/status", { maxRetries: 2 });
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.data).toEqual({ data: "recovered" });
    expect(report.matchedCount).toBe(2);
  });

  it("should verify fallback executes when primary service fails with 500", async () => {
    const defaultRecommendations = ["Item A", "Item B", "Item C"];

    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "recommendations.example.test" },
          fault: { type: "http-error", status: 500 }
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      return await fetchWithFallback(
        "https://recommendations.example.test/personalized",
        defaultRecommendations
      );
    });

    expect(result.source).toBe("fallback");
    expect(result.data).toEqual(defaultRecommendations);
    expect(report.matchedCount).toBe(1);
  });

  it("should verify fallback executes when primary service times out", async () => {
    const cachedRates = { USD: 1.0, EUR: 0.92, GBP: 0.78 };

    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "forex.example.test" },
          fault: { type: "timeout", timeoutMs: 10 }
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      return await fetchWithFallback("https://forex.example.test/latest", cachedRates);
    });

    expect(result.source).toBe("fallback");
    expect(result.data).toEqual(cachedRates);
    expect(report.matchedCount).toBe(1);
  });
});
