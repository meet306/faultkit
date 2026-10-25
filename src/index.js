/**
 * FaultKit — Deterministic HTTP dependency fault-injection testing library for Node.js.
 * @module faultkit
 */

export const VERSION = "0.1.0";

// Public scenario factory & class
export { createScenario, Scenario } from "./scenario/create-scenario.js";
export { ScenarioResult } from "./scenario/scenario-result.js";

// Public error classes
export {
  FaultKitError,
  ValidationError,
  ScenarioError,
  FaultSimulationError,
  UnmatchedRequestError
} from "./errors/faultkit-error.js";

// Validation and matching utilities
export { validateScenarioOptions, validateRule } from "./matching/rule-validation.js";
export {
  extractRequestDetails,
  matchesRequest,
  matchesPattern
} from "./matching/request-matcher.js";

// Lifecycle and fetch adapter helpers
export { isFetchPatched, forceRestoreFetch, getOriginalFetch } from "./adapters/fetch.js";

// Privacy and diagnostics utilities
export { redactHeaders, DEFAULT_REDACTED_HEADERS } from "./reporting/scenario-report.js";

// Deterministic PRNG
export { createPRNG } from "./prng/seed.js";
