import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createScenario, isFetchPatched, UnmatchedRequestError } from "../../src/index.js";
import { startLocalServer } from "../fixtures/server.js";

describe("Fetch Interception Integration", () => {
  /** @type {Awaited<ReturnType<typeof startLocalServer>>} */
  let fixtureServer;

  beforeAll(async () => {
    fixtureServer = await startLocalServer();
  });

  afterAll(async () => {
    await fixtureServer.close();
  });

  it("should intercept matching request and return http-error response", async () => {
    const scenario = createScenario({
      name: "stripe-service-down",
      rules: [
        {
          match: {
            hostname: "api.stripe.com",
            pathname: "/v1/charges",
            method: "POST"
          },
          fault: {
            type: "http-error",
            status: 503,
            statusText: "Service Unavailable",
            body: { error: "payment_system_offline" }
          }
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      const response = await fetch("https://api.stripe.com/v1/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 5000 })
      });
      const data = await response.json();
      return { status: response.status, data };
    });

    expect(result.status).toBe(503);
    expect(result.data).toEqual({ error: "payment_system_offline" });
    expect(report.matchedCount).toBe(1);
    expect(report.faultsTriggered).toBe(1);
    expect(report.rules[0].timesActivated).toBe(1);
    expect(isFetchPatched()).toBe(false);
  });

  it("should simulate delayed response", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "slow-service.test" },
          fault: {
            type: "delay",
            delayMs: 30,
            response: { status: 200, body: "Delayed Response" }
          }
        }
      ]
    });

    const start = Date.now();
    const { result } = await scenario.run(async () => {
      const res = await fetch("https://slow-service.test/api");
      return await res.text();
    });
    const elapsed = Date.now() - start;

    expect(result).toBe("Delayed Response");
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  it("should simulate request timeout error", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "timeout.example.test" },
          fault: {
            type: "timeout",
            timeoutMs: 15,
            message: "Simulated gateway timeout"
          }
        }
      ]
    });

    await scenario.run(async () => {
      await expect(fetch("https://timeout.example.test/status")).rejects.toThrow(
        "Simulated gateway timeout"
      );
    });
  });

  it("should simulate connection reset network error matching native fetch failure", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "reset.example.test" },
          fault: {
            type: "network-error",
            code: "ECONNRESET"
          }
        }
      ]
    });

    await scenario.run(async () => {
      try {
        await fetch("https://reset.example.test/data");
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
        expect(err.message).toBe("fetch failed");
        expect(err.cause).toBeDefined();
        expect(err.cause.code).toBe("ECONNRESET");
      }
    });
  });

  it("should exhaust rule after 'times' count and passthrough subsequent requests", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: {
            hostname: "127.0.0.1",
            pathname: "/hello"
          },
          fault: {
            type: "http-error",
            status: 503,
            body: { error: "temporarily_down" }
          },
          times: 2
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      // 1st request -> should fail with 503
      const res1 = await fetch(`${fixtureServer.url}/hello`);
      // 2nd request -> should fail with 503
      const res2 = await fetch(`${fixtureServer.url}/hello`);
      // 3rd request -> rule exhausted, should hit real fixture server with 200
      const res3 = await fetch(`${fixtureServer.url}/hello`);
      const data3 = await res3.json();

      return {
        status1: res1.status,
        status2: res2.status,
        status3: res3.status,
        data3
      };
    });

    expect(result.status1).toBe(503);
    expect(result.status2).toBe(503);
    expect(result.status3).toBe(200);
    expect(result.data3).toEqual({ message: "Hello from local fixture!" });
    expect(report.matchedCount).toBe(2);
    expect(report.rules[0].exhausted).toBe(true);
  });

  it("should pass through unmatched requests when passthrough: true", async () => {
    const scenario = createScenario({
      passthrough: true,
      rules: [
        {
          match: { hostname: "other-domain.test" },
          fault: { type: "http-error", status: 500 }
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      const res = await fetch(`${fixtureServer.url}/hello`);
      return await res.json();
    });

    expect(result).toEqual({ message: "Hello from local fixture!" });
    expect(report.matchedCount).toBe(0);
  });

  it("should throw UnmatchedRequestError when passthrough: false and request does not match", async () => {
    const scenario = createScenario({
      passthrough: false,
      rules: [
        {
          match: { hostname: "other.test" },
          fault: { type: "http-error", status: 500 }
        }
      ]
    });

    await scenario.run(async () => {
      await expect(fetch(`${fixtureServer.url}/hello`)).rejects.toThrow(UnmatchedRequestError);
    });
  });

  it("should support manual activate() and deactivate() outside scenario.run", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "manual.test" },
          fault: { type: "http-error", status: 418 }
        }
      ]
    });

    expect(isFetchPatched()).toBe(false);
    scenario.activate();
    expect(isFetchPatched()).toBe(true);

    try {
      const res = await fetch("https://manual.test/tea");
      expect(res.status).toBe(418);
    } finally {
      scenario.deactivate();
      await scenario.dispose();
      expect(isFetchPatched()).toBe(false);
    }
  });
});
