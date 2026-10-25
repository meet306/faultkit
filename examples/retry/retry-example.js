/**
 * @file Retry example demonstrating testing an application retry loop with FaultKit.
 * Run with: node examples/retry/retry-example.js
 */

import { createScenario } from "../../src/index.js";

/**
 * Application service function with an automatic retry loop.
 */
async function submitOrder(orderData, maxRetries = 3) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;
    console.log(`[Attempt ${attempt}] Submitting order to checkout service...`);

    try {
      const response = await fetch("https://orders.ecommerce.test/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, attempts: attempt, data };
      }

      if (response.status === 503 && attempt <= maxRetries) {
        console.log(`  -> Received 503 Service Unavailable. Backing off before retry...`);
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }

      const errorText = await response.text();
      return { success: false, attempts: attempt, error: errorText };
    } catch (err) {
      if (attempt <= maxRetries) {
        console.log(`  -> Network error (${err.message}). Retrying...`);
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Max retries exceeded");
}

async function run() {
  console.log("=== FaultKit Retry Verification Example ===\n");

  const scenario = createScenario({
    name: "orders-transient-503-recovery",
    rules: [
      // Fails twice with 503
      {
        match: { hostname: "orders.ecommerce.test", pathname: "/checkout", method: "POST" },
        fault: { type: "http-error", status: 503 },
        times: 2
      },
      // Succeeds on the 3rd request with 200 OK
      {
        match: { hostname: "orders.ecommerce.test", pathname: "/checkout", method: "POST" },
        fault: {
          type: "http-error",
          status: 200,
          body: { orderId: "ord_990011", status: "confirmed" }
        },
        times: 1
      }
    ]
  });

  const { result, report } = await scenario.run(async () => {
    return await submitOrder({ item: "mechanical-keyboard", price: 120 });
  });

  console.log("\nOutcome:");
  console.log(`Success:           ${result.success}`);
  console.log(`Attempts taken:    ${result.attempts}`);
  console.log(`Order Data:        ${JSON.stringify(result.data)}`);

  console.log("\nScenario Metrics:");
  console.log(`- Matched Requests: ${report.matchedCount}`);
  console.log(
    `- Rule 0 (503s):    Activated ${report.rules[0].timesActivated} times (Exhausted: ${report.rules[0].exhausted})`
  );
  console.log(`- Rule 1 (200 OK):  Activated ${report.rules[1].timesActivated} time`);
  console.log("\nRetry verification completed successfully!");
}

run().catch((err) => {
  console.error("Retry example error:", err);
  process.exit(1);
});
