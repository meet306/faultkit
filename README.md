# FaultKit

[![CI](https://github.com/faultkit/faultkit/actions/workflows/ci.yml/badge.svg)](https://github.com/faultkit/faultkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](package.json)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

**Deterministic HTTP dependency fault-injection and resilience testing library for Node.js.**

FaultKit lets developers simulate real-world external HTTP dependency failures (HTTP 503s, slow responses, timeouts, connection resets, and intermittent outages) directly inside their Node.js automated test suites to verify retries, fallbacks, and circuit breakers.

---

## Table of Contents

- [Why FaultKit?](#why-faultkit)
- [Target Audience](#target-audience)
- [What FaultKit Does Not Do](#what-faultkit-does-not-do)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Supported HTTP Fault Types](#supported-http-fault-types)
  - [1. HTTP Error Responses](#1-http-error-responses)
  - [2. Configurable Delays](#2-configurable-delays)
  - [3. Request Timeouts](#3-request-timeouts)
  - [4. Network Connection Drops (ECONNRESET)](#4-network-connection-drops-econnreset)
  - [5. Seeded Intermittent Failures](#5-seeded-intermittent-failures)
- [Request Matching Engine](#request-matching-engine)
- [Deterministic Scenarios (`times` count)](#deterministic-scenarios-times-count)
- [Testing Retries and Fallbacks](#testing-retries-and-fallbacks)
- [Test-Runner Integration (Vitest / Jest)](#test-runner-integration-vitest--jest)
- [Concurrency & Isolation (`AsyncLocalStorage`)](#concurrency--isolation-asynclocalstorage)
- [Security and Privacy by Default](#security-and-privacy-by-default)
- [Compatibility Matrix](#compatibility-matrix)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Contributing & License](#contributing--license)

---

## Why FaultKit?

Modern Node.js applications depend on third-party APIs for billing (Stripe), communication (Twilio, SendGrid), cloud storage, and microservices. When these services degrade or fail, applications can crash, enter infinite retry storms, or freeze worker threads.

Traditional solutions fall short:

- **Mock servers (Nock, MSW):** Geared toward happy-path response stubbing, requiring complex boilerplate to simulate stateful retry failures or probabilistic dropouts.
- **External chaos daemons (Toxiproxy):** Require out-of-process Go daemons and dynamic port remapping, making them too heavy for fast unit and component test suites.
- **Manual function spies (`vi.spyOn(globalThis, 'fetch')`):** Suffer from high boilerplate, lack realistic `Response` and `AbortSignal` semantics, and contaminate global state across concurrent tests.

**FaultKit provides:**

- **Zero runtime dependencies:** Built purely on Node.js 20+ web standards (`fetch`, `Headers`, `Response`, `AbortSignal`, `AsyncLocalStorage`).
- **Context-isolated execution:** Safely execute parallel tests without cross-test leakage.
- **First-class fault primitives:** Native delays, timeouts, connection resets, and seeded intermittent failures.
- **Structured post-test diagnostics:** Automatically track which rules fired and how many attempts were made, while redacting sensitive tokens and credentials.

---

## Target Audience

- Node.js backend engineers (Express, Fastify, NestJS, Koa, native HTTP).
- Developers testing retry policies, circuit breakers, fallback caches, and timeout budgets.
- Teams maintaining automated CI/CD integration test pipelines that demand fast, reproducible, offline execution.

---

## What FaultKit Does Not Do

- **Not a production chaos tool:** FaultKit is strictly an in-memory testing library for development and automated test suites. Do not use FaultKit in production environments.
- **Not a contract-mocking server:** If you need to generate full mock API schemas for frontend prototyping, use MSW. FaultKit is focused on dependency resilience and failure testing.
- **Not a packet-level network proxy:** FaultKit does not manipulate Linux kernel iptables or simulate raw TCP MTU packet corruption.

---

## Installation

Install FaultKit as a development dependency:

```bash
npm install -D faultkit
```

_Requirements: Node.js 20.0.0 or higher._

---

## Quick Start

```javascript
import { createScenario } from "faultkit";

// 1. Define a failure scenario
const scenario = createScenario({
  name: "payment-gateway-down",
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
        body: { error: "Service Unavailable" }
      },
      times: 1 // Fails once, then passes through or succeeds
    }
  ]
});

// 2. Run your application code within the isolated scenario context
const { result, report } = await scenario.run(async () => {
  const response = await fetch("https://api.stripe.com/v1/charges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 1000 })
  });

  return { status: response.status, data: await response.json() };
});

console.log(result.status); // 503
console.log(report.matchedCount); // 1
console.log(report.faultsTriggered); // 1
```

---

## Supported HTTP Fault Types

### 1. HTTP Error Responses

Simulates any HTTP status code (400–599) with custom headers and string or JSON payloads.

```javascript
const scenario = createScenario({
  rules: [
    {
      match: { hostname: "api.service.test" },
      fault: {
        type: "http-error",
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "60" },
        body: { message: "Rate limit exceeded" }
      }
    }
  ]
});
```

### 2. Configurable Delays

Simulates high latency or slow network responses. Delay timers cleanly respect request `AbortSignal` instances.

```javascript
const scenario = createScenario({
  rules: [
    {
      match: { hostname: "slow-dependency.test" },
      fault: {
        type: "delay",
        delayMs: 250,
        response: { status: 200, body: "Slow OK" } // Optional custom response after delay
      }
    }
  ]
});
```

### 3. Request Timeouts

Simulates an upstream request exceeding its timeout deadline, throwing a native `DOMException` with `name: 'TimeoutError'`.

```javascript
const scenario = createScenario({
  rules: [
    {
      match: { hostname: "upstream-service.test" },
      fault: {
        type: "timeout",
        timeoutMs: 50, // Optional delay before timeout occurs
        message: "Upstream gateway connection timed out"
      }
    }
  ]
});
```

### 4. Network Connection Drops (ECONNRESET)

Simulates broken sockets, connection resets, and dropped TCP connections matching Node's native fetch failure (`TypeError: fetch failed` with `cause.code: 'ECONNRESET'`).

```javascript
const scenario = createScenario({
  rules: [
    {
      match: { hostname: "unstable-host.test" },
      fault: {
        type: "network-error",
        code: "ECONNRESET"
      }
    }
  ]
});
```

### 5. Seeded Intermittent Failures

Simulates probabilistic, flaky failures (e.g., 40% failure rate) using a deterministic PRNG seed so your tests reproduce identical results every time.

```javascript
const scenario = createScenario({
  seed: 42, // Guarantees identical sequence across test runs
  rules: [
    {
      match: { hostname: "flaky-api.test" },
      fault: {
        type: "intermittent",
        rate: 0.4, // 40% chance of failure
        fault: { type: "http-error", status: 500 }
      }
    }
  ]
});
```

---

## Request Matching Engine

Rules can match requests on any combination of criteria:

| Match Field | Supported Types                         | Example                                                                         |
| :---------- | :-------------------------------------- | :------------------------------------------------------------------------------ |
| `method`    | String (`*` for any)                    | `"POST"`, `"GET"`, `"*"`                                                        |
| `hostname`  | String, Wildcard, RegExp, Predicate     | `"api.stripe.com"`, `"*.example.com"`, `/^api\./`, `(h) => h.endsWith(".test")` |
| `pathname`  | String, RegExp, Predicate               | `"/v1/charges"`, `/^\/v1\/users\/\d+$/`                                         |
| `query`     | Key-value dictionary                    | `{ status: "pending", limit: /^\d+$/ }`                                         |
| `headers`   | Key-value dictionary (case-insensitive) | `{ "x-api-version": "2024-01-01" }`                                             |

_Unmatched requests:_ By default, unmatched requests pass through to the real network (`passthrough: true`). To fail fast when an unexpected request is dispatched, set `passthrough: false`, which throws an `UnmatchedRequestError`.

---

## Deterministic Scenarios (`times` count)

Test retry algorithms by specifying `times: n`. Once a rule activates `n` times, it is marked exhausted, and subsequent requests fall through to subsequent rules or normal passthrough:

```javascript
const scenario = createScenario({
  rules: [
    // Fails the first 2 attempts with 503
    {
      match: { hostname: "api.service.test" },
      fault: { type: "http-error", status: 503 },
      times: 2
    },
    // The 3rd attempt succeeds with 200 OK
    {
      match: { hostname: "api.service.test" },
      fault: { type: "http-error", status: 200, body: { status: "success" } },
      times: 1
    }
  ]
});
```

---

## Testing Retries and Fallbacks

### Testing a Retry Loop with Vitest

```javascript
import { test, expect } from "vitest";
import { createScenario } from "faultkit";
import { myPaymentService } from "../src/payment.js";

test("payment service retries on transient 503 and succeeds on 3rd attempt", async () => {
  const scenario = createScenario({
    rules: [
      {
        match: { hostname: "payments.example.com" },
        fault: { type: "http-error", status: 503 },
        times: 2
      },
      {
        match: { hostname: "payments.example.com" },
        fault: { type: "http-error", status: 200, body: { chargeId: "ch_123" } },
        times: 1
      }
    ]
  });

  const { result, report } = await scenario.run(async () => {
    return await myPaymentService.chargeCustomer({ amount: 5000 });
  });

  expect(result.chargeId).toBe("ch_123");
  expect(report.matchedCount).toBe(3);
  expect(report.rules[0].exhausted).toBe(true);
});
```

### Testing a Fallback Cache

```javascript
test("returns cached currency rates when external forex service times out", async () => {
  const scenario = createScenario({
    rules: [
      {
        match: { hostname: "forex.example.com" },
        fault: { type: "timeout", timeoutMs: 10 }
      }
    ]
  });

  const { result } = await scenario.run(async () => {
    return await currencyService.getLatestRates("USD");
  });

  expect(result.source).toBe("cache");
  expect(result.rates.EUR).toBeDefined();
});
```

---

## Concurrency & Isolation (`AsyncLocalStorage`)

In modern test runners like Vitest, tests run concurrently. Global monkey-patching usually creates flaky collisions where Test A intercepts requests meant for Test B.

FaultKit solves this via **Node.js `AsyncLocalStorage`**:

- When calling `await scenario.run(async () => { ... })`, rules are scoped **only to that asynchronous execution tree**.
- Parallel tests executing `scenarioA.run()` and `scenarioB.run()` in the same process remain isolated and never cross-contaminate.
- When the callback finishes (or throws), resources, timers, and interception state are restored automatically.

---

## Security and Privacy by Default

- **Zero Telemetry:** FaultKit never sends crash reports, analytics, or outbound network calls.
- **Sensitive Credential Redaction:** In scenario diagnostic reports and event logs, authorization headers and tokens are redacted by default:
  - `authorization` -> `[REDACTED]`
  - `cookie` -> `[REDACTED]`
  - `set-cookie` -> `[REDACTED]`
  - `x-api-key` -> `[REDACTED]`
- **DoS & Freeze Protection:** Delays are strictly capped at 300,000 ms (5 minutes) and rule counts are capped at 1,000 per scenario to prevent accidental infinite CI hangs.
- **Zero Dependencies:** Minimizes attack surface and supply-chain vulnerabilities.

---

## Compatibility Matrix

| Runtime / Client                | Supported          | Details                                           |
| :------------------------------ | :----------------- | :------------------------------------------------ |
| **Node.js 20.x, 22.x+**         | :white_check_mark: | Native ES modules and built-in `fetch`            |
| **Global `fetch`**              | :white_check_mark: | First-class native interception                   |
| **Undici**                      | :white_check_mark: | Supported via Node's native fetch implementation  |
| **Ky / Got (fetch adapter)**    | :white_check_mark: | Supported when configured with global `fetch`     |
| **Axios (fetch adapter)**       | :white_check_mark: | Supported using Axios `adapter: 'fetch'`          |
| **Legacy `http.ClientRequest`** | :x:                | Legacy raw `http.get` without `fetch` is bypassed |

---

## Troubleshooting

### Unmatched requests failing with `UnmatchedRequestError`

By default, `passthrough: true` allows unmatched requests to reach the real network. If you receive `UnmatchedRequestError`, check if `passthrough: false` was set, or inspect your rule's `hostname` and `pathname` matchers for typos.

### Delayed requests timing out in test runners

Ensure your test runner's test timeout (e.g. Vitest `testTimeout: 5000`) is higher than your simulated `delayMs`. For fast unit tests, prefer small delays (10ms–50ms).

---

## Contributing & License

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, coding guidelines, and contribution instructions.

Released under the [MIT License](LICENSE). Copyright (c) 2026 FaultKit Contributors.
