import { describe, it, expect } from "vitest";
import {
  createScenario,
  getOriginalFetch,
  forceRestoreFetch,
  FaultSimulationError,
  ScenarioResult
} from "../../src/index.js";

describe("API Coverage and Edge Cases", () => {
  it("ScenarioResult getters should return report properties", () => {
    const report = {
      scenarioName: "test",
      matchedCount: 3,
      faultsTriggered: 2,
      durationMs: 50,
      rules: [{ index: 0, name: "r0", timesConfigured: 1, timesActivated: 1, exhausted: true }],
      events: [
        {
          timestamp: Date.now(),
          method: "GET",
          url: "https://test.com",
          ruleIndex: 0,
          faultType: "http-error",
          faultTriggered: true,
          headers: {}
        }
      ],
      cleanup: { success: true, errors: [] }
    };

    const result = new ScenarioResult("test", { data: "ok" }, report);
    expect(result.matchedCount).toBe(3);
    expect(result.faultsTriggered).toBe(2);
    expect(result.durationMs).toBe(50);
    expect(result.rules).toEqual(report.rules);
    expect(result.events).toEqual(report.events);
    expect(result.cleanup).toEqual(report.cleanup);
  });

  it("FaultSimulationError should instantiate with code and details", () => {
    const err = new FaultSimulationError("Simulation failed", { step: "delay" });
    expect(err.code).toBe("ERR_FAULTKIT_SIMULATION");
    expect(err.details).toEqual({ step: "delay" });
  });

  it("fetch adapter getOriginalFetch and forceRestoreFetch", () => {
    const orig = getOriginalFetch();
    expect(typeof orig).toBe("function");

    forceRestoreFetch();
    expect(getOriginalFetch()).toBe(globalThis.fetch);
  });

  it("scenario getReport() should return current snapshot without disposing", () => {
    const scenario = createScenario({ name: "snapshot-test" });
    const report = scenario.getReport();
    expect(report.scenarioName).toBe("snapshot-test");
    expect(scenario.isDisposed).toBe(false);
  });

  it("should trigger intermittent fault in scenario.run when roll succeeds", async () => {
    // With rate 1.0, intermittent fault always triggers
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "always-fault.test" },
          fault: {
            type: "intermittent",
            rate: 1.0,
            fault: { type: "http-error", status: 503 }
          }
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      const res = await fetch("https://always-fault.test/data");
      return res.status;
    });

    expect(result).toBe(503);
    expect(report.faultsTriggered).toBe(1);
    expect(report.events[0].faultType).toBe("http-error");
  });

  it("should skip intermittent fault in scenario.run when rate is 0.0 and passthrough", async () => {
    const scenario = createScenario({
      passthrough: true,
      rules: [
        {
          match: { hostname: "never-fault.test" },
          fault: {
            type: "intermittent",
            rate: 0.0,
            fault: { type: "http-error", status: 503 }
          }
        }
      ]
    });

    // Mock fetch proxy delegation test
    const { report } = await scenario.run(async () => {
      // Mock unpatched fetch so it doesn't fail on nonexistent domain
      try {
        await fetch("https://never-fault.test/data");
      } catch {
        // Ignored
      }
    });

    expect(report.matchedCount).toBe(1);
    expect(report.faultsTriggered).toBe(0);
    expect(report.events[0].faultType).toBe("intermittent-skipped");
  });
});
