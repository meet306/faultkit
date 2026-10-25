# FaultKit Security Model & Boundaries

## 1. Threat Model & Trust Boundaries

FaultKit is a test automation library designed for execution during local development and CI/CD pipelines. It is **not** designed to run inside production runtime environments.

### Assumptions

1. **Trusted Codebase:** Test code invoking FaultKit is written and executed by trusted developers or automated build pipelines.
2. **In-Process Scope:** FaultKit runs in the same Node.js process and memory space as the test runner and the application code under test.
3. **No External Network Listeners:** FaultKit does not bind to external network interfaces, open sockets, or create background HTTP control servers.

---

## 2. Security Boundaries & Protections

### 2.1 Input Validation & Denial-of-Service Defense

- **Delays:** FaultKit validates all `delayMs` and `timeoutMs` inputs. Values must be non-negative, finite numbers. Values exceeding reasonable testing bounds (default limit: 300,000 ms / 5 minutes) are rejected to prevent test suites from freezing indefinitely.
- **Rule Limits:** To prevent memory exhaustion from misconfigured loops, a single scenario may not exceed 1,000 rules.
- **Status Codes:** HTTP status codes must be integers between 100 and 599.
- **URL Normalization:** URLs are parsed using the standard `URL` constructor. Malformed URLs are safely rejected without throwing unhandled exceptions.
- **Code Execution:** FaultKit uses plain object validation. It never uses `eval()`, `new Function()`, or dynamic script execution.

### 2.2 Network Safety

- FaultKit does not issue outbound HTTP requests on module import or scenario creation.
- Interception is strictly in-process: it wraps Node's native `fetch` client and inspects requests before dispatch.
- By default, requests not matching any active scenario rules are passed through to the real network (or can be configured to fail fast via `passthrough: false`).

### 2.3 Privacy & Secret Redaction

During testing, requests often contain credentials, session cookies, or API keys. FaultKit's diagnostic reporting engine:

1. Redacts sensitive request and response headers (`authorization`, `cookie`, `set-cookie`, `proxy-authorization`, `x-api-key`, `api-key`, `x-auth-token`).
2. Does not capture or store large request/response payload bodies in scenario logs by default.
3. Never persists captured request telemetry to disk.

### 2.4 Resource Management & Timer Leak Prevention

- Simulated delays and timeouts schedule timers via `setTimeout`.
- All active timers are tracked in an internal `Set`.
- When a scenario completes, is disposed, or encounters an unexpected exception, all active timers are cleared (`clearTimeout`).
- When requests include an `AbortSignal`, aborting the signal immediately clears the delay timer and triggers an `AbortError`.

---

## 3. Recommended Best Practices for Consumers

1. **Do not install in production:** Install FaultKit as a `devDependency` (`npm install -D faultkit`).
2. **Use isolated scenario execution:** Use `await scenario.run(async () => { ... })` rather than manual global activation to guarantee automatic cleanup even if test assertions fail.
3. **Keep test delays small:** In automated tests, prefer small delays (e.g., 50ms-200ms) or mock timers to keep CI test suites fast.
