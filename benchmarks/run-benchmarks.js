/**
 * @file Reproducible benchmark suite for FaultKit.
 * Measures scenario creation, matching overhead, interception latency, concurrency, and memory stability.
 */

import { performance } from "node:perf_hooks";
import process from "node:process";
import { createScenario, matchesRequest, extractRequestDetails } from "../src/index.js";

function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(Math.round(num));
}

async function runBenchmarkSuite() {
  console.log("===============================================================");
  console.log("             FaultKit Performance Benchmark Suite             ");
  console.log("===============================================================");
  console.log(`Node.js Version: ${process.version}`);
  console.log(`Platform / Arch: ${process.platform} / ${process.arch}`);
  console.log(`V8 Version:      ${process.versions.v8}`);
  console.log(`Date:            ${new Date().toISOString()}`);
  console.log("---------------------------------------------------------------\n");

  const results = {};

  // 1. Scenario Creation & Disposal
  {
    const iterations = 10000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const scenario = createScenario({
        name: `bench-${i}`,
        rules: [{ match: { hostname: "test.com" }, fault: { type: "http-error", status: 500 } }]
      });
      await scenario.dispose();
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / elapsed) * 1000;
    results.scenarioLifecycle = {
      iterations,
      elapsedMs: elapsed.toFixed(2),
      opsPerSec: Math.round(opsPerSec),
      avgUsPerOp: ((elapsed / iterations) * 1000).toFixed(2)
    };
    console.log(`[1] Scenario Creation & Disposal:`);
    console.log(
      `    ${formatNumber(opsPerSec)} ops/sec (${results.scenarioLifecycle.avgUsPerOp} µs/op across ${formatNumber(iterations)} runs)\n`
    );
  }

  // 2. Request Matching Engine Overhead
  {
    const iterations = 50000;
    const reqDetails = extractRequestDetails("https://api.payments.com/v1/charges?limit=10", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const matchCriteria = {
      hostname: "api.payments.com",
      pathname: "/v1/charges",
      method: "POST",
      query: { limit: "10" }
    };

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      matchesRequest(reqDetails, matchCriteria);
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / elapsed) * 1000;
    results.requestMatching = {
      iterations,
      elapsedMs: elapsed.toFixed(2),
      opsPerSec: Math.round(opsPerSec),
      avgNsPerOp: ((elapsed / iterations) * 1000000).toFixed(2)
    };
    console.log(`[2] Request Matching Engine:`);
    console.log(
      `    ${formatNumber(opsPerSec)} ops/sec (${results.requestMatching.avgNsPerOp} ns/op across ${formatNumber(iterations)} checks)\n`
    );
  }

  // 3. In-Process Interception Overhead
  {
    const iterations = 5000;
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "bench-fault.test" },
          fault: { type: "http-error", status: 503, body: { error: "bench" } }
        }
      ]
    });

    const start = performance.now();
    await scenario.run(async () => {
      for (let i = 0; i < iterations; i++) {
        await fetch("https://bench-fault.test/resource");
      }
    });
    const elapsed = performance.now() - start;
    await scenario.dispose();

    const opsPerSec = (iterations / elapsed) * 1000;
    results.interception = {
      iterations,
      elapsedMs: elapsed.toFixed(2),
      opsPerSec: Math.round(opsPerSec),
      avgUsPerReq: ((elapsed / iterations) * 1000).toFixed(2)
    };
    console.log(`[3] HTTP Error Interception:`);
    console.log(
      `    ${formatNumber(opsPerSec)} reqs/sec (${results.interception.avgUsPerReq} µs/req for intercepted fetch response)\n`
    );
  }

  // 4. Multi-Rule Matching Scaling
  {
    console.log(`[4] Multi-Rule Matching Scaling:`);
    results.ruleScaling = {};
    for (const ruleCount of [1, 10, 50, 100]) {
      const rules = Array.from({ length: ruleCount }, (_, idx) => ({
        match: { hostname: `service-${idx}.test`, pathname: `/api/${idx}` },
        fault: { type: "http-error", status: 500 }
      }));

      const scenario = createScenario({ rules });
      const targetUrl = `https://service-${ruleCount - 1}.test/api/${ruleCount - 1}`;

      const iterations = 2000;
      const start = performance.now();
      await scenario.run(async () => {
        for (let i = 0; i < iterations; i++) {
          await fetch(targetUrl);
        }
      });
      const elapsed = performance.now() - start;
      await scenario.dispose();

      const avgUs = ((elapsed / iterations) * 1000).toFixed(2);
      results.ruleScaling[`rules_${ruleCount}`] = { ruleCount, avgUsPerReq: avgUs };
      console.log(`    ${ruleCount.toString().padStart(3)} rules: ${avgUs} µs/req`);
    }
    console.log();
  }

  // 5. Concurrent Requests Throughput
  {
    const concurrency = 1000;
    const scenario = createScenario({
      rules: [
        {
          match: { hostname: "concurrent.test" },
          fault: { type: "http-error", status: 503 }
        }
      ]
    });

    const start = performance.now();
    await scenario.run(async () => {
      const promises = Array.from({ length: concurrency }, () =>
        fetch("https://concurrent.test/resource")
      );
      await Promise.all(promises);
    });
    const elapsed = performance.now() - start;
    await scenario.dispose();

    const opsPerSec = (concurrency / elapsed) * 1000;
    results.concurrency = {
      concurrency,
      totalElapsedMs: elapsed.toFixed(2),
      opsPerSec: Math.round(opsPerSec)
    };
    console.log(`[5] Concurrency Throughput:`);
    console.log(
      `    ${formatNumber(concurrency)} concurrent requests completed in ${elapsed.toFixed(2)} ms (${formatNumber(opsPerSec)} reqs/sec)\n`
    );
  }

  // 6. Memory Stability
  {
    if (globalThis.gc) {
      globalThis.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;
    const iterations = 3000;

    for (let i = 0; i < iterations; i++) {
      const scenario = createScenario({
        name: `mem-check-${i}`,
        rules: [{ match: { hostname: "mem.test" }, fault: { type: "http-error", status: 500 } }]
      });
      await scenario.run(async () => {
        await fetch("https://mem.test/run");
      });
      await scenario.dispose();
    }

    if (globalThis.gc) {
      globalThis.gc();
    }
    const memAfter = process.memoryUsage().heapUsed;
    const deltaKb = ((memAfter - memBefore) / 1024).toFixed(2);
    results.memory = {
      heapBeforeMb: (memBefore / 1024 / 1024).toFixed(2),
      heapAfterMb: (memAfter / 1024 / 1024).toFixed(2),
      deltaKb
    };
    console.log(`[6] Memory Usage Across ${formatNumber(iterations)} Executions:`);
    console.log(`    Heap Before: ${results.memory.heapBeforeMb} MB`);
    console.log(`    Heap After:  ${results.memory.heapAfterMb} MB`);
    console.log(`    Net Delta:   ${deltaKb} KB\n`);
  }

  console.log("===============================================================");
  console.log("Benchmark suite completed successfully.");
  console.log("===============================================================");
}

runBenchmarkSuite().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
