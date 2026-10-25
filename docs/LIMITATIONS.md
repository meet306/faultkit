# FaultKit Limitations & Design Constraints

FaultKit is designed to be an in-process, zero-dependency testing tool. To maintain predictability and simplicity, certain design trade-offs and technical limitations exist.

---

## 1. Supported Client Boundaries

- **Supported:**
  - Node.js native `fetch` (Node.js 20+).
  - Modern HTTP client libraries that use `fetch` or can be configured with a fetch adapter (e.g., modern Axios with `fetch` adapter, Ky, Got with custom fetch, native SDKs like `@octokit/rest`, AWS SDK v3 with fetch handler, Stripe Node SDK with fetch httpClient).
- **Not Supported Out-of-the-Box:**
  - Legacy Node.js `http.request()` and `https.request()` calls that bypass `fetch`. If your application uses legacy libraries making raw `http.ClientRequest` without `fetch`, FaultKit will not intercept them.
  - Non-HTTP protocols: WebSockets, gRPC (HTTP/2 binary framing), raw TCP/UDP sockets, DNS resolution failures.

---

## 2. In-Process Simulation vs. Real Chaos Engineering

- FaultKit is an **in-process testing library**, not a network proxy daemon.
- It operates by intercepting requests inside the V8 runtime before they reach the OS network stack.
- It is ideal for testing:
  - Application retry loops.
  - Fallback logic and default responses.
  - Circuit breakers.
  - Graceful degradation and error handling.
- It is **not** intended for:
  - Real TCP/IP packet corruption, half-duplex connections, or MTU truncation.
  - Physical network partition testing (for this, use Linux netem, iptables, or Toxiproxy).
  - Production chaos experiments (FaultKit must never be used in production).

---

## 3. Concurrency Guarantees

- **`scenario.run(async () => { ... })`:**  
  Fully safe for concurrent execution across asynchronous test flows within the same process thread. Powered by Node.js `AsyncLocalStorage`.
- **`scenario.activate()` and `scenario.deactivate()`:**  
  Modifies the process-wide active scenario. If you use manual activation in test suites running concurrent tests in the same process thread, they may observe each other's rules. For concurrent test execution, always prefer `scenario.run()`.

---

## 4. Response Streaming & Extreme Payloads

- FaultKit currently focuses on discrete HTTP requests and responses. Streaming bodies (e.g. Server-Sent Events or multi-gigabyte Chunked Transfer-Encoding streams) are buffered into in-memory `Response` objects.
