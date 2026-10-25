import { describe, it, expect } from "vitest";
import { createScenario } from "../../src/index.js";

describe("Concurrency and Context Isolation Integration", () => {
  it("should isolate concurrent scenarios running in parallel via AsyncLocalStorage", async () => {
    const scenarioA = createScenario({
      name: "scenario-a",
      rules: [
        {
          match: { hostname: "service-a.test" },
          fault: { type: "http-error", status: 503, body: { scenario: "A" } }
        }
      ]
    });

    const scenarioB = createScenario({
      name: "scenario-b",
      rules: [
        {
          match: { hostname: "service-b.test" },
          fault: { type: "http-error", status: 404, body: { scenario: "B" } }
        }
      ]
    });

    const taskA = scenarioA.run(async () => {
      // Artificial slight delay to interleave execution
      await new Promise((r) => setTimeout(r, 10));
      const resA = await fetch("https://service-a.test/endpoint");
      const dataA = await resA.json();
      return { status: resA.status, data: dataA };
    });

    const taskB = scenarioB.run(async () => {
      const resB = await fetch("https://service-b.test/endpoint");
      const dataB = await resB.json();
      return { status: resB.status, data: dataB };
    });

    const [resA, resB] = await Promise.all([taskA, taskB]);

    expect(resA.result.status).toBe(503);
    expect(resA.result.data).toEqual({ scenario: "A" });
    expect(resA.report.matchedCount).toBe(1);
    expect(resA.report.scenarioName).toBe("scenario-a");

    expect(resB.result.status).toBe(404);
    expect(resB.result.data).toEqual({ scenario: "B" });
    expect(resB.report.matchedCount).toBe(1);
    expect(resB.report.scenarioName).toBe("scenario-b");
  });

  it("should handle multiple parallel requests within the same scenario accurately", async () => {
    const scenario = createScenario({
      name: "burst-traffic",
      rules: [
        {
          match: { hostname: "api.burst.test" },
          fault: {
            type: "delay",
            delayMs: 15,
            response: { status: 429, body: "Too Many Requests" }
          }
        }
      ]
    });

    const { result, report } = await scenario.run(async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        fetch(`https://api.burst.test/item/${i}`).then((res) => res.status)
      );
      return await Promise.all(requests);
    });

    expect(result).toHaveLength(10);
    expect(result.every((status) => status === 429)).toBe(true);
    expect(report.matchedCount).toBe(10);
    expect(report.faultsTriggered).toBe(10);
    expect(report.rules[0].timesActivated).toBe(10);
  });
});
