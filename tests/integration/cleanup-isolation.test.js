import { describe, it, expect } from "vitest";
import { createScenario, isFetchPatched, ScenarioError } from "../../src/index.js";

describe("Cleanup and Isolation Integration", () => {
  it("should cleanly restore state and clear timers when user code throws an exception", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "error.test" },
          fault: { type: "delay", delayMs: 200 }
        }
      ]
    });

    expect(isFetchPatched()).toBe(false);

    await expect(
      scenario.run(async () => {
        expect(isFetchPatched()).toBe(true);
        // Start an asynchronous fetch that will get delayed
        fetch("https://error.test/long").catch(() => {});
        throw new Error("User assertion failed inside test");
      })
    ).rejects.toThrow("User assertion failed inside test");

    // Interception must be deactivated and timers cleared
    expect(isFetchPatched()).toBe(false);
    expect(scenario.isActive).toBe(false);
    expect(scenario.resourceTracker.timers.size).toBe(0);
  });

  it("should support multiple sequential runs after reset()", async () => {
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "seq.test" },
          fault: { type: "http-error", status: 500 },
          times: 1
        }
      ]
    });

    // Run 1
    const run1 = await scenario.run(async () => {
      const res = await fetch("https://seq.test/run1");
      return res.status;
    });
    expect(run1.result).toBe(500);
    expect(run1.report.rules[0].exhausted).toBe(true);

    // Reset and Run 2
    scenario.reset();
    expect(scenario.rules[0].timesActivated).toBe(0);

    const run2 = await scenario.run(async () => {
      const res = await fetch("https://seq.test/run2");
      return res.status;
    });
    expect(run2.result).toBe(500);
    expect(run2.report.matchedCount).toBe(1);
  });

  it("should be idempotent when dispose() is called multiple times", async () => {
    const scenario = createScenario();
    const report1 = await scenario.dispose();
    const report2 = await scenario.dispose();

    expect(report1).toBeDefined();
    expect(report2).toBeDefined();
    expect(scenario.isDisposed).toBe(true);

    // Attempting to run a disposed scenario must throw ScenarioError
    await expect(scenario.run(async () => {})).rejects.toThrow(ScenarioError);
    expect(() => scenario.activate()).toThrow(ScenarioError);
  });
});
