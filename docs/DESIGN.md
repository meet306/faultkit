# FaultKit Architectural Design Document

**Status:** Approved & Implemented  
**Language:** Plain JavaScript (ES Modules, Node.js 20+)  
**Runtime Dependencies:** 0

---

## 1. System Overview and Goals

FaultKit provides a deterministic, lightweight, and isolated mechanism for simulating HTTP dependency failures in Node.js test environments.

### Key Design Pillars

1. **Zero Runtime Dependencies:** Built strictly on Node.js 20+ built-ins (`fetch`, `Request`, `Response`, `Headers`, `AbortController`, `AbortSignal`, `AsyncLocalStorage`).
2. **Context-Isolated Execution:** Parallel tests in modern test runners (such as Vitest) must not interfere with each other. FaultKit uses `AsyncLocalStorage` to associate active scenarios with their execution context.
3. **Deterministic Fault Primitives:** Faults are explicitly typed (`http-error`, `delay`, `timeout`, `network-error`, `intermittent`) and predictable (`times` activation counts, seeded PRNG for probabilistic intermittence).
4. **Safety and Least Astonishment:**
   - No background servers or open ports.
   - Non-matching requests pass through to the real network by default.
   - Sensitive headers (`authorization`, `cookie`, `set-cookie`, `x-api-key`) are redacted by default from diagnostic reports.
   - All timers and handles are guaranteed to be cleaned up, even when user code throws.

---

## 2. Architecture & Module Structure

```
src/
├── index.js                     # Main public API exports
├── scenario/
│   ├── create-scenario.js       # Scenario factory and definition
│   ├── execute-scenario.js      # Scoped execution runner with AsyncLocalStorage
│   └── scenario-result.js       # Execution result and report aggregation
├── faults/
│   ├── http-error.js            # HTTP status error response generator
│   ├── delay.js                 # Delay simulator with AbortSignal cancellation
│   ├── timeout.js               # Client-side timeout/AbortError simulator
│   ├── network-error.js         # Socket hang-up / ECONNRESET simulator
│   └── intermittent.js          # Seeded probabilistic fault wrapper
├── matching/
│   ├── request-matcher.js       # Hostname, pathname, method, query, header matcher
│   └── rule-validation.js       # Schema and constraint validator
├── adapters/
│   └── fetch.js                 # Global fetch interception adapter with context awareness
├── lifecycle/
│   ├── cleanup.js               # Resource tracking and timer disposal
│   └── cancellation.js          # AbortSignal listener management
├── reporting/
│   └── scenario-report.js       # Privacy-conscious diagnostics collector
├── errors/
│   └── faultkit-error.js        # Error hierarchy
└── prng/
    └── seed.js                  # Mulberry32 seeded deterministic PRNG
```

---

## 3. Core Subsystems

### 3.1 Interception Engine & Async Context Isolation

Node.js 20+ applications universally use `globalThis.fetch`.
When `faultkit` installs its fetch interceptor:

1. The original `globalThis.fetch` reference is preserved.
2. The proxy wrapper queries `scenarioStorage.getStore()`:
   - If an async context is active, the associated scenario processes the request.
   - If no async context is active, it checks if a globally activated scenario is registered (for `scenario.activate()` workflows).
   - If no scenario matches or no scenario is active, the call is delegated directly to the original `fetch`.
3. When `scenario.run(fn)` is executed, `scenarioStorage.run({ scenario }, fn)` runs the user callback within the isolated context.
4. Concurrently running scenarios do not leak rules or state across asynchronous boundaries.

### 3.2 Request Matching Engine

A rule matches an incoming request if all specified criteria match:

- `method`: Case-insensitive string equality (or `*` / omitted for any).
- `hostname`: Exact string, regex, or predicate function.
- `pathname`: Exact string, regex, or predicate function.
- `query`: Exact string, regex, or predicate matching each key-value pair.
- `headers`: Case-insensitive header name matching against string or regex values.

Normalized URL parsing handles relative URLs, trailing slashes, and port specifications predictably.

### 3.3 Fault Generators

1. **HTTP Error (`http-error`):** Returns a standard `Response` object with the configured status code (400-599), custom headers, and optional body (text or JSON-serialized).
2. **Delay (`delay`):** Uses a timer to pause response delivery. Subscribes to the request's `AbortSignal`; if aborted during the delay, immediately clears the timer and rejects with `DOMException('The operation was aborted', 'AbortError')`.
3. **Timeout (`timeout`):** Simulates an HTTP client timeout by waiting for `timeoutMs` (or immediately) and throwing a `DOMException` / `TimeoutError` adhering to standard fetch timeout specifications.
4. **Network Error (`network-error`):** Simulates a connection drop or socket reset by rejecting with `TypeError('fetch failed', { cause: new Error('ECONNRESET') })`, replicating Node's native fetch socket failure.
5. **Intermittent (`intermittent`):** Uses a deterministic Mulberry32 PRNG. Given a `seed` and `rate` (e.g., 0.5), it triggers the specified fault when `prng() < rate` and allows the request through (or delegates to fallback) otherwise.

### 3.4 Resource Lifecycle & Disposal

- All active timers created during delays or timeouts are tracked in a `Set`.
- `scenario.dispose()` cancels all active timers, de-registers any listeners, and unpatches `fetch` if no other active scenarios remain.
- `scenario.run()` wraps execution in `try ... finally` to guarantee disposal even if the test assertions throw.

---

## 4. Public API Specification

```javascript
import { createScenario, FaultKitError } from "faultkit";

const scenario = createScenario({
  name: "stripe-outage",
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
      times: 2 // Fails twice, then passes through
    }
  ]
});

// Run scoped within async context
const { result, report } = await scenario.run(async () => {
  return await paymentService.processCharge({ amount: 1000 });
});

console.log(report.matchedCount); // 2
console.log(report.faultsTriggered); // 2
await scenario.dispose();
```
