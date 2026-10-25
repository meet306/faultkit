# FaultKit Performance Benchmarks

This document records the official, reproducible benchmark results for FaultKit.

---

## 1. Environment & Methodology

- **Node.js Version:** `v22.13.1`
- **V8 Engine Version:** `12.4.254.21-node.22`
- **Platform / Architecture:** `Windows (win32) / x64`
- **Benchmark Script:** `benchmarks/run-benchmarks.js`
- **Execution Command:** `npm run bench`
- **Date Measured:** October 2026

All benchmarks measure in-process execution timing using `performance.now()`. Memory measurements inspect `process.memoryUsage().heapUsed` before and after repetitive scenario creation, execution, and disposal cycles.

---

## 2. Actual Measured Results

### 2.1 Scenario Lifecycle (Creation & Disposal)

Measures the overhead of instantiating `createScenario`, validating rules, setting up internal trackers, and executing `scenario.dispose()`.

| Metric              | Result                                  |
| :------------------ | :-------------------------------------- |
| **Throughput**      | **355,427 operations / second**         |
| **Average Latency** | **2.81 µs** per creation/disposal cycle |
| **Sample Size**     | 10,000 continuous iterations            |

_Interpretation:_ Creating and tearing down scenarios has negligible overhead, meaning developers can safely create fresh scenarios inside individual unit tests without noticeable test suite slowdown.

---

### 2.2 Request Matching Engine

Measures the performance of `matchesRequest` checking hostname, pathname, method, and query parameters against an incoming request.

| Metric              | Result                             |
| :------------------ | :--------------------------------- |
| **Throughput**      | **2,330,177 checks / second**      |
| **Average Latency** | **429.15 ns** per match evaluation |
| **Sample Size**     | 50,000 checks                      |

_Interpretation:_ The matching engine resolves in sub-microsecond time (under 430 nanoseconds), adding negligible latency to HTTP call inspection.

---

### 2.3 HTTP Error Interception Overhead

Measures end-to-end `fetch()` interception, context lookup via `AsyncLocalStorage`, request extraction, fault generation (`Response` instantiation), and report event recording.

| Metric              | Result                             |
| :------------------ | :--------------------------------- |
| **Throughput**      | **68,777 requests / second**       |
| **Average Latency** | **14.54 µs** per intercepted fetch |
| **Sample Size**     | 5,000 requests                     |

---

### 2.4 Multi-Rule Scaling

Measures how request handling scales as rule sets grow in size:

| Rule Count    | Average Latency    |
| :------------ | :----------------- |
| **1 Rule**    | **6.17 µs** / req  |
| **10 Rules**  | **6.25 µs** / req  |
| **50 Rules**  | **8.03 µs** / req  |
| **100 Rules** | **12.48 µs** / req |

_Interpretation:_ Rule evaluation scales linearly with minimal overhead. Even with 100 configured rules, request resolution takes only ~12.5 µs.

---

### 2.5 Concurrency Throughput

Measures 1,000 concurrent promises executed in parallel within an active `scenario.run()` context.

| Metric                    | Result                        |
| :------------------------ | :---------------------------- |
| **Concurrency Level**     | 1,000 parallel requests       |
| **Total Completion Time** | **3.31 ms**                   |
| **Effective Throughput**  | **302,051 requests / second** |

---

### 2.6 Memory Stability

Measures `process.memoryUsage().heapUsed` across 3,000 complete scenario creation, fetch execution, and disposal iterations:

| Stage                     | Heap Used                          |
| :------------------------ | :--------------------------------- |
| **Initial Baseline**      | 18.74 MB                           |
| **Post 3,000 Iterations** | 13.27 MB                           |
| **Net Heap Growth**       | **0 KB (No memory leak detected)** |

_Interpretation:_ FaultKit does not retain lingering references, timers, or uncollected closures across runs. Memory is fully reclaimed by standard V8 garbage collection.

---

## 3. How to Reproduce

Run the benchmark suite locally in your terminal:

```bash
npm run bench
```
