import { describe, it, expect } from "vitest";
import { redactHeaders, ScenarioReportCollector } from "../../src/reporting/scenario-report.js";

describe("Scenario Reporting and Privacy Redaction", () => {
  describe("redactHeaders", () => {
    it("should redact sensitive headers from Headers instance", () => {
      const headers = new Headers({
        Authorization: "Bearer secret-token-12345",
        Cookie: "session_id=abcdefg",
        "X-API-Key": "my-api-key",
        "Content-Type": "application/json",
        Accept: "*/*"
      });

      const redacted = redactHeaders(headers);

      expect(redacted["authorization"]).toBe("[REDACTED]");
      expect(redacted["cookie"]).toBe("[REDACTED]");
      expect(redacted["x-api-key"]).toBe("[REDACTED]");
      expect(redacted["content-type"]).toBe("application/json");
      expect(redacted["accept"]).toBe("*/*");
    });

    it("should redact custom headers specified by user", () => {
      const headers = {
        "x-internal-secret": "ultra-sensitive-data",
        "user-agent": "FaultKit/1.0"
      };

      const redacted = redactHeaders(headers, ["x-internal-secret"]);
      expect(redacted["x-internal-secret"]).toBe("[REDACTED]");
      expect(redacted["user-agent"]).toBe("FaultKit/1.0");
    });

    it("should handle empty or null headers safely", () => {
      // @ts-ignore
      expect(redactHeaders(null)).toEqual({});
      // @ts-ignore
      expect(redactHeaders(undefined)).toEqual({});
    });
  });

  describe("ScenarioReportCollector", () => {
    it("should collect metrics and generate structured report", () => {
      const rules = [
        { name: "rule-1", times: 2 },
        { name: "rule-2", times: Infinity }
      ];
      const collector = new ScenarioReportCollector("test-scenario", rules);

      collector.recordEvent({
        method: "POST",
        url: "https://api.example.com/pay",
        ruleIndex: 0,
        faultType: "http-error",
        faultTriggered: true,
        status: 503,
        headers: new Headers({ Authorization: "Bearer sec" })
      });

      collector.recordEvent({
        method: "POST",
        url: "https://api.example.com/pay",
        ruleIndex: 0,
        faultType: "http-error",
        faultTriggered: true,
        status: 503
      });

      collector.recordCleanup([]);

      const report = collector.generateReport();
      expect(report.scenarioName).toBe("test-scenario");
      expect(report.matchedCount).toBe(2);
      expect(report.faultsTriggered).toBe(2);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
      expect(report.rules[0].timesActivated).toBe(2);
      expect(report.rules[0].exhausted).toBe(true);
      expect(report.rules[1].timesActivated).toBe(0);
      expect(report.rules[1].exhausted).toBe(false);
      expect(report.events[0].headers["authorization"]).toBe("[REDACTED]");
      expect(report.cleanup.success).toBe(true);
    });

    it("should reset collector state cleanly", () => {
      const collector = new ScenarioReportCollector("test", [{ times: 1 }]);
      collector.recordEvent({
        method: "GET",
        url: "https://test.com",
        ruleIndex: 0,
        faultType: "delay",
        faultTriggered: true
      });

      expect(collector.matchedCount).toBe(1);
      collector.reset();

      expect(collector.matchedCount).toBe(0);
      expect(collector.faultsTriggered).toBe(0);
      expect(collector.events).toHaveLength(0);
    });
  });
});
