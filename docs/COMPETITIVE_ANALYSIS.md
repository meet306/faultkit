# Competitive Analysis: Node.js HTTP Mocking and Fault-Injection

**Date of Research:** October 2026 (Verified against Node.js 20+ runtime ecosystem)  
**Author:** FaultKit Maintainers  
**Status:** Completed & Integrated into Design Specifications

---

## 1. Executive Summary

Testing how Node.js backend applications respond to dependency failures (503 Service Unavailable, network timeouts, connection resets, transient blips, and slow responses) is critical for resilience. However, developers currently face a fragmented ecosystem:

1. **Mocking libraries** (Nock, MSW, Undici MockAgent) are designed primarily for _happy-path API stubbing_ rather than _declarative fault injection_.
2. **Network-level chaos tools** (Toxiproxy, Chaos Mesh) require external processes, daemons, Docker containers, or kernel capabilities, making them too heavy for lightweight, fast unit and integration test suites.
3. **Manual test-runner mocks** (`vi.spyOn(globalThis, 'fetch')`) are verbose, error-prone, lack realistic HTTP semantics (e.g., proper `Response` and `AbortSignal` behavior), and do not provide structured reporting or deterministic intermittent failures.

**FaultKit's Primary Value Proposition:**  
Make deterministic HTTP dependency-failure scenarios easy to define, reproduce, isolate, and assert against in Node.js tests without running external daemons, modifying application network configurations, or compromising test concurrency.

---

## 2. Analysis of Existing Solutions

### 2.1 Nock

- **Primary Use Case:** HTTP mocking for Node.js `http` and `https` modules.
- **Mechanism:** Monkey-patches Node.js core `http.ClientRequest`.
- **Strengths:**
  - Mature, widely used across older Node.js codebases.
  - Rich URL, header, and query parameter matching syntax.
  - Supports reply with error (`replyWithError`).
- **Pain Points & Weaknesses:**
  - **Native `fetch` incompatibility:** Modern Node.js (v18+) uses `Undici` for global `fetch`, bypassing Node's `http.ClientRequest`. Nock struggles with native `fetch` without complex additional interceptors.
  - **Global state mutation:** Nock modifies global prototypes, creating frequent leakage between tests when tests run concurrently.
  - **Fault semantics:** Fault injection (e.g. realistic delay with cancellation, connection resets, intermittent failure with PRNG seed) requires awkward workarounds.
  - **Heavy dependency footprint:** Numerous dependencies and transitive packages.

### 2.2 Mock Service Worker (MSW)

- **Primary Use Case:** API mocking across Browser and Node.js using Service Worker and interceptor abstractions.
- **Mechanism:** Uses `@mswjs/interceptors` to intercept `http`, `https`, `fetch`, and `XMLHttpRequest`.
- **Strengths:**
  - Standard Request/Response standard (`fetch` API primitives).
  - Excellent browser-node parity.
  - Modern, well-maintained community.
- **Pain Points & Weaknesses:**
  - **Mock-first, not fault-first:** Primary objective is contract and response stubbing. To simulate retries or intermittent faults, developers must write stateful counter closures manually.
  - **No structured scenario reporting:** Does not provide automated metrics on how many faults were triggered, which rules activated, or audit logs for test assertions.
  - **Configuration overhead:** Requires setting up servers, handler arrays, lifecycle hooks (`beforeAll`, `afterEach`, `afterAll`).
  - **Not focused on chaos:** No built-in seeded pseudo-random intermittent failure generators.

### 2.3 Undici `MockAgent`

- **Primary Use Case:** Client-level mocking for applications using `undici` or Node.js global `fetch`.
- **Mechanism:** Implements an Undici `Dispatcher` that intercepts requests dispatched via `undici.request` or `fetch`.
- **Strengths:**
  - Native to Undici, zero third-party dependencies when using Node.js built-ins.
  - High performance.
- **Pain Points & Weaknesses:**
  - **Low-level API:** Requires setting up `MockAgent`, `get(origin)`, `intercept(options)`, which is verbose and rigid.
  - **Global dispatcher contention:** Calling `setGlobalDispatcher` affects all concurrent operations across the entire Node process, breaking test isolation in parallel test runners like Vitest.
  - **Limited fault primitives:** Primarily stubs status codes and responses. Simulating socket hangs, delays tied to `AbortSignal`, or seeded random dropouts requires complex manual interceptor logic.
  - **No execution diagnostics:** Does not produce scenario summary reports or structured execution metadata.

### 2.4 Test-Runner Spies (`vi.spyOn(globalThis, 'fetch')`)

- **Primary Use Case:** Ad-hoc function replacement in Vitest or Jest.
- **Mechanism:** Direct replacement of the global `fetch` function.
- **Strengths:**
  - No additional packages required.
  - Built directly into the test runner.
- **Pain Points & Weaknesses:**
  - **High boilerplate:** Every test must implement URL parsing, method matching, conditional logic for fallbacks, and response construction.
  - **Unrealistic semantics:** Easy to forget `Response.ok`, `Response.statusText`, `Response.headers`, or `signal.aborted` propagation.
  - **No concurrent isolation:** Parallel tests mutating `globalThis.fetch` cause race conditions and flaky test runs.

### 2.5 External Chaos Tools (Toxiproxy, Gremlin, Chaos Mesh)

- **Primary Use Case:** Real network-level fault injection (latency, packet loss, bandwidth limits).
- **Mechanism:** Out-of-process network proxies or OS-level packet manipulation.
- **Strengths:**
  - Tests the true TCP socket and operating system networking stack.
  - Language-agnostic.
- **Pain Points & Weaknesses:**
  - **High operational complexity:** Requires running external daemons, managing dynamic ports, and configuring application target URLs.
  - **Unsuitable for unit/component tests:** Cannot run in isolated in-memory test environments or lightweight CI runners without Docker.
  - **Slow execution:** High latency and teardown overhead.

---

## 3. Comparison Matrix

| Feature                            | Nock              | MSW (Node)   | Undici MockAgent  | vi.spyOn                 | FaultKit (Target)                                      |
| :--------------------------------- | :---------------- | :----------- | :---------------- | :----------------------- | :----------------------------------------------------- |
| **Primary Focus**                  | HTTP Mocking      | API Mocking  | Client Mocking    | Generic Spy              | **HTTP Fault Injection & Resilience Testing**          |
| **Native `fetch` Support**         | Partial / Brittle | Yes          | Yes               | Manual                   | **Yes (Node 20+ first-class)**                         |
| **Zero Runtime Dependencies**      | No                | No           | Yes (bundled)     | Yes                      | **Yes (0 external runtime deps)**                      |
| **Declarative Fault Types**        | Basic             | Manual       | Basic             | Manual                   | **Rich (Status, Delay, Timeout, Reset, Intermittent)** |
| **Deterministic Activation Count** | `times(n)`        | Manual state | `times(n)`        | `mockImplementationOnce` | **Declarative `times: n` per rule**                    |
| **Seeded Intermittent Failures**   | No                | No           | No                | No                       | **Yes (Mulberry32 PRNG with seed)**                    |
| **Async Context Isolation**        | No (Global)       | Shared       | Global Dispatcher | Global                   | **Yes (`AsyncLocalStorage` scoped execution)**         |
| **Structured Scenario Report**     | No                | No           | No                | No                       | **Yes (Duration, Matches, Faults, Safe Logs)**         |
| **Automatic Cleanup Guarantees**   | Manual cleanAll   | Manual reset | Manual close      | Manual restore           | **Yes (`scenario.run` scoped try/finally & dispose)**  |
| **External Daemons Required**      | No                | No           | No                | No                       | **No (100% in-process)**                               |

---

## 4. The FaultKit Differentiation Strategy

FaultKit avoids competing directly with general-purpose mock servers for complex schema-based mock APIs. Instead, FaultKit targets the **reliability and resilience testing gap**:

1. **Scoped Scenario Execution:**  
   By leveraging Node.js `AsyncLocalStorage`, `scenario.run(async () => { ... })` ensures that fault rules only apply to operations executed within that async execution context. Concurrent Vitest worker threads or parallel test suites will not cross-contaminate each other.

2. **Fault Primitives as First-Class Citizens:**  
   Instead of forcing developers to construct mock responses, FaultKit provides dedicated fault definitions:
   - `http-error`: Status, headers, body payload.
   - `delay`: Time-delayed responses respecting `AbortSignal`.
   - `timeout`: Simulating fetch timeouts (`TimeoutError` / `AbortError`).
   - `network-error`: Simulating connection drops (`ECONNRESET`, socket hang-ups).
   - `intermittent`: Probabilistic dropouts governed by a deterministic seed.

3. **Built-in Resilience Verification:**  
   Testing retries, fallbacks, and circuit breakers requires knowing how many times a dependency was hit and whether it failed in the expected sequence. FaultKit returns structured diagnostic reports (`result.matchedCount`, `result.faultsTriggered`, `result.rulesActivated`) while automatically redacting sensitive credentials and headers.

4. **Zero-Overhead, Zero-Dependency Architecture:**  
   Built purely on modern Node.js 20+ web standard APIs (`fetch`, `Request`, `Response`, `Headers`, `AbortSignal`, `AsyncLocalStorage`). Zero runtime dependencies minimize supply-chain risk and maintenance burden.
