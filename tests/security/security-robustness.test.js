import { describe, it, expect } from "vitest";
import {
  createScenario,
  ValidationError,
  redactHeaders,
  sanitizeUrl,
  createPRNG,
  extractRequestDetails
} from "../../src/index.js";

describe("Security and Robustness", () => {
  it("should reject malicious or prototype-polluting option shapes", () => {
    expect(() =>
      createScenario({
        // @ts-ignore
        rules: "__proto__"
      })
    ).toThrow(ValidationError);

    expect(() =>
      createScenario({
        // @ts-ignore
        rules: [{ fault: { type: "eval-injection", code: "evil()" } }]
      })
    ).toThrow(ValidationError);
  });

  it("should reject excessive delay values to prevent hanging CI indefinitely", () => {
    expect(() =>
      createScenario({
        rules: [
          {
            fault: { type: "delay", delayMs: 1000000 } // > 300,000 ms
          }
        ]
      })
    ).toThrow(ValidationError);
  });

  it("should reject negative or NaN status codes", () => {
    expect(() =>
      createScenario({
        rules: [
          {
            fault: { type: "http-error", status: -500 }
          }
        ]
      })
    ).toThrow(ValidationError);

    expect(() =>
      createScenario({
        rules: [
          {
            fault: { type: "http-error", status: 999 }
          }
        ]
      })
    ).toThrow(ValidationError);
  });

  it("should redact authorization credentials, API keys, and session cookies from diagnostic reports", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "auth.secure.test" },
          fault: { type: "http-error", status: 401 }
        }
      ]
    });

    const { report } = await scenario.run(async () => {
      await fetch("https://auth.secure.test/login", {
        headers: {
          Authorization: "Bearer super-secret-jwt-token-12345",
          Cookie: "session=xyz987; token=abc1234",
          "X-API-Key": "live_key_998877",
          "Custom-Safe-Header": "VisibleValue"
        }
      });
    });

    expect(report.events).toHaveLength(1);
    const recordedHeaders = report.events[0].headers;

    expect(recordedHeaders["authorization"]).toBe("[REDACTED]");
    expect(recordedHeaders["cookie"]).toBe("[REDACTED]");
    expect(recordedHeaders["x-api-key"]).toBe("[REDACTED]");
    expect(recordedHeaders["custom-safe-header"]).toBe("VisibleValue");
  });

  it("should handle aborted fetch via AbortController cleanly without lingering timers", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "abort.secure.test" },
          fault: { type: "delay", delayMs: 150 }
        }
      ]
    });

    await scenario.run(async () => {
      const controller = new AbortController();
      const fetchPromise = fetch("https://abort.secure.test/hang", {
        signal: controller.signal
      });

      // Abort after 15ms
      setTimeout(() => {
        controller.abort();
      }, 15);

      await expect(fetchPromise).rejects.toThrow();
    });

    // Verify all timers were purged from the tracker
    expect(scenario.resourceTracker.timers.size).toBe(0);
  });

  it("should survive rapid scenario creation, activation, and disposal loops without leaking state", async () => {
    for (let i = 0; i < 50; i++) {
      const scenario = createScenario({
        name: `rapid-${i}`,
        rules: [
          {
            match: { hostname: `rapid-${i}.test` },
            fault: { type: "http-error", status: 500 }
          }
        ]
      });

      await scenario.run(async () => {
        const res = await fetch(`https://rapid-${i}.test/test`);
        expect(res.status).toBe(500);
      });

      await scenario.dispose();
    }
  });

  it("should prevent prototype pollution in header redaction", () => {
    const malicious = Object.create(null);
    malicious["authorization"] = "Bearer token";
    malicious["normal"] = "value";

    const redacted = redactHeaders(malicious);
    expect(redacted["authorization"]).toBe("[REDACTED]");
    expect(redacted["normal"]).toBe("value");
    expect(redacted["__proto__"]).toBeUndefined();
  });

  it("should handle stateful regular expressions with /g and /y flags without alternating failures", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { pathname: /\/checkout/g },
          fault: { type: "http-error", status: 503 }
        }
      ]
    });

    await scenario.run(async () => {
      // Multiple consecutive requests with stateful regex should all match
      const res1 = await fetch("https://service.test/checkout");
      const res2 = await fetch("https://service.test/checkout");
      const res3 = await fetch("https://service.test/checkout");

      expect(res1.status).toBe(503);
      expect(res2.status).toBe(503);
      expect(res3.status).toBe(503);
    });
  });

  it("should sanitize basic auth credentials and sensitive query parameters in report URLs", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "auth.secure.test" },
          fault: { type: "http-error", status: 400 }
        }
      ]
    });

    const { report } = await scenario.run(async () => {
      await fetch(
        "https://admin:mysecretpassword@auth.secure.test/api?apiKey=secret_key_123&token=tok_456&safe=1"
      );
    });

    expect(report.events).toHaveLength(1);
    const loggedUrl = report.events[0].url;
    expect(loggedUrl).not.toContain("mysecretpassword");
    expect(loggedUrl).not.toContain("secret_key_123");
    expect(loggedUrl).not.toContain("tok_456");
    expect(loggedUrl).toContain("safe=1");
    expect(loggedUrl).toContain("[REDACTED]");
  });

  it("should trim header keys and redact array-based entries", () => {
    const headersWithSpace = { "Authorization ": "Bearer secret123" };
    const redactedSpace = redactHeaders(headersWithSpace);
    expect(redactedSpace["authorization"]).toBe("[REDACTED]");

    const arrayHeaders = [
      ["x-api-key", "live_key_abc"],
      ["Content-Type", "application/json"]
    ];
    const redactedArray = redactHeaders(arrayHeaders);
    expect(redactedArray["x-api-key"]).toBe("[REDACTED]");
    expect(redactedArray["content-type"]).toBe("application/json");
  });

  it("should allow repeated scenario.run calls on the same scenario without freezing", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "repeat.test" },
          fault: { type: "delay", delayMs: 15 }
        }
      ]
    });

    // Run 1
    const run1 = await scenario.run(async () => {
      const res = await fetch("https://repeat.test/run1");
      return res.status;
    });
    expect(run1.result).toBe(200);

    // Run 2 (previously hung forever because tracker.isDisposed was true)
    const run2 = await scenario.run(async () => {
      const res = await fetch("https://repeat.test/run2");
      return res.status;
    });
    expect(run2.result).toBe(200);
  });

  it("should support wildcard matching for hostname * and pathname prefixes", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "*", pathname: "/api/*" },
          fault: { type: "http-error", status: 504 }
        }
      ]
    });

    await scenario.run(async () => {
      const res1 = await fetch("https://subdomain.domain.com/api/v1/users");
      const res2 = await fetch("https://otherdomain.org/api/status");
      expect(res1.status).toBe(504);
      expect(res2.status).toBe(504);
    });
  });

  it("should handle null-body status codes like 205 without throwing TypeError", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "reset.test" },
          fault: { type: "http-error", status: 205, body: "Ignored reset payload" }
        }
      ]
    });

    await scenario.run(async () => {
      const res = await fetch("https://reset.test/reset");
      expect(res.status).toBe(205);
    });
  });

  it("should produce a distinct, valid deterministic sequence with seed: 0", () => {
    const prngDefault = createPRNG(123456789);
    const prngZero = createPRNG(0);

    const valDefault = prngDefault();
    const valZero = prngZero();

    expect(valZero).toBeGreaterThanOrEqual(0);
    expect(valZero).toBeLessThan(1);
    expect(valZero).not.toBe(valDefault);
  });

  it("should handle global scenario activations in stack order without ghost deactivation", async () => {
    const scenarioA = createScenario({
      rules: [{ match: { hostname: "a.test" }, fault: { type: "http-error", status: 501 } }]
    });
    const scenarioB = createScenario({
      rules: [{ match: { hostname: "b.test" }, fault: { type: "http-error", status: 502 } }]
    });

    scenarioA.activate();
    scenarioB.activate();

    const resB = await fetch("https://b.test");
    expect(resB.status).toBe(502);

    scenarioB.deactivate();

    // Scenario A should remain active after B deactivates!
    const resA = await fetch("https://a.test");
    expect(resA.status).toBe(501);

    scenarioA.deactivate();
  });

  it("should safely handle malformed URL input without unhandled exception", () => {
    const details = extractRequestDetails("http://[");
    expect(details.url).toBeDefined();
    expect(details.method).toBe("GET");
  });

  it("should sanitize raw URL strings via sanitizeUrl directly", () => {
    const sanitized = sanitizeUrl("https://user:pass@host.test?secret=123");
    expect(sanitized).toBe("https://[REDACTED]:[REDACTED]@host.test/?secret=[REDACTED]");
  });
});
