import { describe, it, expect } from "vitest";
import {
  validateScenarioOptions,
  validateRule,
  validateMatchCriteria,
  validateFault
} from "../../src/matching/rule-validation.js";
import { ValidationError } from "../../src/errors/faultkit-error.js";

describe("Rule and Scenario Validation", () => {
  describe("validateScenarioOptions", () => {
    it("should accept valid scenario options", () => {
      expect(() =>
        validateScenarioOptions({
          name: "valid-scenario",
          rules: [
            {
              match: { hostname: "api.example.com", method: "POST" },
              fault: { type: "http-error", status: 503 },
              times: 2
            }
          ],
          seed: 42,
          passthrough: true,
          recordMatches: true,
          redactHeaders: ["authorization"]
        })
      ).not.toThrow();
    });

    it("should reject non-object options", () => {
      // @ts-ignore
      expect(() => validateScenarioOptions(null)).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateScenarioOptions("invalid")).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateScenarioOptions([])).toThrow(ValidationError);
    });

    it("should reject invalid scenario names", () => {
      expect(() => validateScenarioOptions({ name: "" })).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateScenarioOptions({ name: 123 })).toThrow(ValidationError);
      expect(() => validateScenarioOptions({ name: "a".repeat(300) })).toThrow(ValidationError);
    });

    it("should reject non-array rules or excessive rule counts", () => {
      // @ts-ignore
      expect(() => validateScenarioOptions({ rules: {} })).toThrow(ValidationError);
      const excessiveRules = new Array(1001).fill({
        fault: { type: "http-error", status: 500 }
      });
      expect(() => validateScenarioOptions({ rules: excessiveRules })).toThrow(ValidationError);
    });

    it("should reject non-finite seed", () => {
      expect(() => validateScenarioOptions({ seed: NaN })).toThrow(ValidationError);
      expect(() => validateScenarioOptions({ seed: Infinity })).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateScenarioOptions({ seed: "42" })).toThrow(ValidationError);
    });

    it("should reject invalid boolean options", () => {
      // @ts-ignore
      expect(() => validateScenarioOptions({ passthrough: "yes" })).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateScenarioOptions({ recordMatches: 1 })).toThrow(ValidationError);
    });

    it("should reject invalid redactHeaders", () => {
      // @ts-ignore
      expect(() => validateScenarioOptions({ redactHeaders: "authorization" })).toThrow(
        ValidationError
      );
      // @ts-ignore
      expect(() => validateScenarioOptions({ redactHeaders: [123] })).toThrow(ValidationError);
    });
  });

  describe("validateRule and validateFault", () => {
    it("should reject non-object rule", () => {
      // @ts-ignore
      expect(() => validateRule(null)).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateRule("rule")).toThrow(ValidationError);
    });

    it("should reject missing or invalid fault object", () => {
      // @ts-ignore
      expect(() => validateRule({})).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateRule({ fault: "not-an-object" })).toThrow(ValidationError);
      expect(() => validateRule({ fault: { type: "unknown-fault" } })).toThrow(ValidationError);
    });

    it("should validate http-error fault status code bounds", () => {
      expect(() => validateFault({ type: "http-error", status: 99 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "http-error", status: 600 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "http-error", status: 3.14 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "http-error", status: 500, statusText: 123 }, 0)).toThrow(
        ValidationError
      );
      expect(() =>
        validateFault({ type: "http-error", status: 500, statusText: "Internal Error" }, 0)
      ).not.toThrow();
    });

    it("should validate delay fault bounds", () => {
      // @ts-ignore
      expect(() => validateFault({ type: "delay" }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "delay", delayMs: -1 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "delay", delayMs: Infinity }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "delay", delayMs: 400000 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "delay", delayMs: 500 }, 0)).not.toThrow();
    });

    it("should validate timeout fault options", () => {
      expect(() => validateFault({ type: "timeout", timeoutMs: -10 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "timeout", timeoutMs: 1000 }, 0)).not.toThrow();
      expect(() => validateFault({ type: "timeout" }, 0)).not.toThrow();
    });

    it("should validate network-error fault options", () => {
      // @ts-ignore
      expect(() => validateFault({ type: "network-error", code: 123 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "network-error", code: "ECONNRESET" }, 0)).not.toThrow();
    });

    it("should validate intermittent fault options and reject recursion beyond depth 1", () => {
      expect(() => validateFault({ type: "intermittent", rate: -0.1 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "intermittent", rate: 1.5 }, 0)).toThrow(ValidationError);
      expect(() => validateFault({ type: "intermittent", rate: 0.5, fault: "invalid" }, 0)).toThrow(
        ValidationError
      );

      // Valid intermittent wrapping http-error
      expect(() =>
        validateFault(
          {
            type: "intermittent",
            rate: 0.5,
            fault: { type: "http-error", status: 503 }
          },
          0
        )
      ).not.toThrow();

      // Recursive intermittent rejected
      expect(() =>
        validateFault(
          {
            type: "intermittent",
            rate: 0.5,
            fault: {
              type: "intermittent",
              rate: 0.5,
              fault: { type: "http-error", status: 503 }
            }
          },
          0
        )
      ).toThrow(ValidationError);
    });

    it("should validate rule times and name", () => {
      expect(() =>
        validateRule({
          fault: { type: "http-error", status: 500 },
          times: 0
        })
      ).toThrow(ValidationError);

      expect(() =>
        validateRule({
          fault: { type: "http-error", status: 500 },
          times: 1.5
        })
      ).toThrow(ValidationError);

      expect(() =>
        validateRule({
          fault: { type: "http-error", status: 500 },
          name: ""
        })
      ).toThrow(ValidationError);

      expect(() =>
        validateRule({
          fault: { type: "http-error", status: 500 },
          times: 5,
          name: "retry-twice"
        })
      ).not.toThrow();
    });

    it("should validate match criteria", () => {
      expect(() => validateMatchCriteria({ method: "INVALID_METHOD" }, 0)).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateMatchCriteria({ hostname: 123 }, 0)).toThrow(ValidationError);
      expect(() => validateMatchCriteria({ hostname: "" }, 0)).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateMatchCriteria({ pathname: 123 }, 0)).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateMatchCriteria({ headers: "content-type" }, 0)).toThrow(ValidationError);
      // @ts-ignore
      expect(() => validateMatchCriteria({ query: "q=1" }, 0)).toThrow(ValidationError);

      expect(() =>
        validateMatchCriteria(
          {
            method: "POST",
            hostname: "api.example.com",
            pathname: /^\/v1\/charges/,
            query: { key: "val" },
            headers: { "x-custom": "true" }
          },
          0
        )
      ).not.toThrow();
    });
  });
});
