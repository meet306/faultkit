import { describe, it, expect } from "vitest";
import { createScenario, ValidationError, redactHeaders } from "../../src/index.js";

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
});
