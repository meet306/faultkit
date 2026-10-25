/**
 * @file Fallback example demonstrating testing fallback logic upon external dependency timeout.
 * Run with: node examples/fallback/fallback-example.js
 */

import { createScenario } from "../../src/index.js";

const CACHED_RATES = {
  base: "USD",
  rates: { EUR: 0.92, GBP: 0.78, JPY: 154.2 }
};

/**
 * Service function fetching live exchange rates with fallback to cached rates on timeout or error.
 */
async function getExchangeRates() {
  console.log("Fetching live rates from external FX provider (https://fx.currency.test/rates)...");
  try {
    const res = await fetch("https://fx.currency.test/rates");
    if (!res.ok) {
      console.log(`Provider returned HTTP ${res.status}. Triggering cached fallback.`);
      return { source: "cache", rates: CACHED_RATES };
    }
    const data = await res.json();
    return { source: "live", rates: data };
  } catch (err) {
    console.log(`Network/Timeout error encountered (${err.message}). Triggering cached fallback.`);
    return { source: "cache", rates: CACHED_RATES };
  }
}

async function run() {
  console.log("=== FaultKit Fallback Verification Example ===\n");

  const scenario = createScenario({
    name: "forex-dependency-timeout",
    rules: [
      {
        match: { hostname: "fx.currency.test", pathname: "/rates" },
        fault: {
          type: "timeout",
          timeoutMs: 10,
          message: "FX gateway upstream connection timed out"
        }
      }
    ]
  });

  const { result, report } = await scenario.run(async () => {
    return await getExchangeRates();
  });

  console.log("\nOutcome:");
  console.log(`Source used: ${result.source}`);
  console.log("Rates data: ", JSON.stringify(result.rates));

  console.log("\nScenario Report:");
  console.log(`- Matched Count: ${report.matchedCount}`);
  console.log(`- Fault Type:    ${report.events[0].faultType}`);
  console.log(`- Error Logged:  ${report.events[0].error}`);
  console.log("\nFallback verification completed successfully!");
}

run().catch((err) => {
  console.error("Fallback example error:", err);
  process.exit(1);
});
