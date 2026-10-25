/**
 * @file Base error classes for FaultKit.
 * @module faultkit/errors
 */

/**
 * Base class for all FaultKit errors.
 */
export class FaultKitError extends Error {
  /**
   * @param {string} message - Error description.
   * @param {string} [code='ERR_FAULTKIT'] - Machine-readable error code.
   * @param {Record<string, unknown>} [details={}] - Additional contextual metadata.
   */
  constructor(message, code = "ERR_FAULTKIT", details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;

    const errorConstructor = /** @type {any} */ (Error);
    if (typeof errorConstructor.captureStackTrace === "function") {
      errorConstructor.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when scenario, rule, or fault options fail validation.
 */
export class ValidationError extends FaultKitError {
  /**
   * @param {string} message - Validation failure message.
   * @param {Record<string, unknown>} [details={}] - Contextual details such as field or value.
   */
  constructor(message, details = {}) {
    super(message, "ERR_FAULTKIT_VALIDATION", details);
  }
}

/**
 * Thrown for scenario lifecycle or state errors (e.g. activating an already disposed scenario).
 */
export class ScenarioError extends FaultKitError {
  /**
   * @param {string} message - Scenario error message.
   * @param {Record<string, unknown>} [details={}] - Contextual details.
   */
  constructor(message, details = {}) {
    super(message, "ERR_FAULTKIT_SCENARIO", details);
  }
}

/**
 * Thrown when an error occurs during fault simulation.
 */
export class FaultSimulationError extends FaultKitError {
  /**
   * @param {string} message - Simulation error message.
   * @param {Record<string, unknown>} [details={}] - Contextual details.
   */
  constructor(message, details = {}) {
    super(message, "ERR_FAULTKIT_SIMULATION", details);
  }
}

/**
 * Thrown when a request does not match any rule and passthrough is disabled.
 */
export class UnmatchedRequestError extends FaultKitError {
  /**
   * @param {string} message - Details of unmatched request.
   * @param {Record<string, unknown>} [details={}] - Request information.
   */
  constructor(message, details = {}) {
    super(message, "ERR_FAULTKIT_UNMATCHED", details);
  }
}
