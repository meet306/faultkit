/**
 * @file Basic example demonstrating FaultKit scenario creation, execution, and diagnostics.
 * Run with: node examples/basic/basic-example.js
 */

import { createScenario } from "../../src/index.js";

async function run() {
  console.log("=== FaultKit Basic Example ===\n");

  const scenario = createScenario({
    name: "payment-gateway-maintenance",
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
          body: {
            error: {
              type: "api_connection_error",
              message: "Payment provider is currently undergoing scheduled maintenance."
            }
          }
        },
        times: 1
      }
    ]
  });

  const { result, report } = await scenario.run(async () => {
    console.log("Invoking fetch('https://api.stripe.com/v1/charges')...");
    const response = await fetch("https://api.stripe.com/v1/charges", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk_test_secret_key_12345",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ amount: 2000, currency: "usd" })
    });

    const body = await response.json();
    return { status: response.status, body };
  });

  console.log("\nResponse Received:");
  console.log(`Status: ${result.status}`);
  console.log("Body:  ", JSON.stringify(result.body, null, 2));

  console.log("\nScenario Report Summary:");
  console.log(`- Scenario Name:   ${report.scenarioName}`);
  console.log(`- Matched Count:   ${report.matchedCount}`);
  console.log(`- Faults Fired:    ${report.faultsTriggered}`);
  console.log(`- Duration:        ${report.durationMs} ms`);
  console.log("- Sanitized Event Headers:");
  console.log(" ", report.events[0].headers);
  console.log("\nExample completed successfully!");
}

run().catch((err) => {
  console.error("Example error:", err);
  process.exit(1);
});
