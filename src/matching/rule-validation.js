/**
 * @file Rule and scenario configuration validator.
 * @module faultkit/matching/rule-validation
 */

import { ValidationError } from "../errors/faultkit-error.js";

const MAX_RULES_PER_SCENARIO = 1000;
const MAX_DELAY_MS = 300000; // 5 minutes max
const VALID_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT",
  "*"
]);

const VALID_FAULT_TYPES = new Set([
  "http-error",
  "delay",
  "timeout",
  "network-error",
  "intermittent"
]);

/**
 * Validates scenario options.
 * @param {Record<string, any>} options
 * @returns {void}
 * @throws {ValidationError}
 */
export function validateScenarioOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new ValidationError("Scenario options must be a non-null object", { options });
  }

  if (options.name !== undefined) {
    if (typeof options.name !== "string" || options.name.trim().length === 0) {
      throw new ValidationError("Scenario name must be a non-empty string", { name: options.name });
    }
    if (options.name.length > 256) {
      throw new ValidationError("Scenario name cannot exceed 256 characters", {
        name: options.name
      });
    }
  }

  if (options.rules !== undefined) {
    if (!Array.isArray(options.rules)) {
      throw new ValidationError("Scenario rules must be an array", { rules: options.rules });
    }
    if (options.rules.length > MAX_RULES_PER_SCENARIO) {
      throw new ValidationError(
        `Scenario cannot exceed ${MAX_RULES_PER_SCENARIO} rules to prevent resource exhaustion`,
        { count: options.rules.length }
      );
    }
    for (let i = 0; i < options.rules.length; i++) {
      validateRule(options.rules[i], i);
    }
  }

  if (options.seed !== undefined) {
    if (typeof options.seed !== "number" || !Number.isFinite(options.seed)) {
      throw new ValidationError("Scenario seed must be a finite number", { seed: options.seed });
    }
  }

  if (options.passthrough !== undefined && typeof options.passthrough !== "boolean") {
    throw new ValidationError("Scenario passthrough must be a boolean", {
      passthrough: options.passthrough
    });
  }

  if (options.recordMatches !== undefined && typeof options.recordMatches !== "boolean") {
    throw new ValidationError("Scenario recordMatches must be a boolean", {
      recordMatches: options.recordMatches
    });
  }

  if (options.redactHeaders !== undefined) {
    if (!Array.isArray(options.redactHeaders)) {
      throw new ValidationError("Scenario redactHeaders must be an array of strings", {
        redactHeaders: options.redactHeaders
      });
    }
    for (const h of options.redactHeaders) {
      if (typeof h !== "string") {
        throw new ValidationError("Each redact header item must be a string", { header: h });
      }
    }
  }
}

/**
 * Validates an individual rule definition.
 * @param {Record<string, any>} rule - Rule configuration.
 * @param {number} [index=0] - Rule index.
 * @returns {void}
 * @throws {ValidationError}
 */
export function validateRule(rule, index = 0) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    throw new ValidationError(`Rule at index ${index} must be an object`, { index, rule });
  }

  if (rule.match !== undefined) {
    validateMatchCriteria(rule.match, index);
  }

  if (!rule.fault || typeof rule.fault !== "object" || Array.isArray(rule.fault)) {
    throw new ValidationError(`Rule at index ${index} must define a valid 'fault' object`, {
      index,
      fault: rule.fault
    });
  }

  validateFault(rule.fault, index, 0);

  if (rule.times !== undefined) {
    if (
      typeof rule.times !== "number" ||
      (!Number.isInteger(rule.times) && rule.times !== Infinity) ||
      rule.times < 1
    ) {
      throw new ValidationError(
        `Rule at index ${index} 'times' must be a positive integer or Infinity`,
        { index, times: rule.times }
      );
    }
  }

  if (rule.name !== undefined && (typeof rule.name !== "string" || rule.name.trim().length === 0)) {
    throw new ValidationError(`Rule at index ${index} 'name' must be a non-empty string`, {
      index,
      name: rule.name
    });
  }
}

/**
 * Validates match criteria.
 * @param {Record<string, any>} match
 * @param {number} index
 */
export function validateMatchCriteria(match, index) {
  if (!match || typeof match !== "object" || Array.isArray(match)) {
    throw new ValidationError(`Rule at index ${index} 'match' must be an object`, { index, match });
  }

  if (match.method !== undefined) {
    if (typeof match.method !== "string") {
      throw new ValidationError(`Rule at index ${index} 'match.method' must be a string`, {
        index,
        method: match.method
      });
    }
    const upperMethod = match.method.toUpperCase();
    if (!VALID_METHODS.has(upperMethod)) {
      throw new ValidationError(
        `Rule at index ${index} has unrecognized HTTP method: ${match.method}`,
        { index, method: match.method }
      );
    }
  }

  if (match.hostname !== undefined) {
    const isString = typeof match.hostname === "string";
    const isRegExp = match.hostname instanceof RegExp;
    const isFunction = typeof match.hostname === "function";

    if (!isString && !isRegExp && !isFunction) {
      throw new ValidationError(
        `Rule at index ${index} 'match.hostname' must be a string, RegExp, or function`,
        { index, hostname: match.hostname }
      );
    }
    if (isString && match.hostname.trim().length === 0) {
      throw new ValidationError(`Rule at index ${index} 'match.hostname' cannot be empty`, {
        index
      });
    }
  }

  if (match.pathname !== undefined) {
    const isString = typeof match.pathname === "string";
    const isRegExp = match.pathname instanceof RegExp;
    const isFunction = typeof match.pathname === "function";

    if (!isString && !isRegExp && !isFunction) {
      throw new ValidationError(
        `Rule at index ${index} 'match.pathname' must be a string, RegExp, or function`,
        { index, pathname: match.pathname }
      );
    }
  }

  if (match.headers !== undefined) {
    if (
      typeof match.headers !== "object" ||
      match.headers === null ||
      Array.isArray(match.headers)
    ) {
      throw new ValidationError(`Rule at index ${index} 'match.headers' must be an object`, {
        index,
        headers: match.headers
      });
    }
  }

  if (match.query !== undefined) {
    if (typeof match.query !== "object" || match.query === null || Array.isArray(match.query)) {
      throw new ValidationError(`Rule at index ${index} 'match.query' must be an object`, {
        index,
        query: match.query
      });
    }
  }
}

/**
 * Validates a fault configuration.
 * @param {Record<string, any>} fault
 * @param {number} ruleIndex
 * @param {number} [depth=0]
 */
export function validateFault(fault, ruleIndex, depth = 0) {
  if (!fault || typeof fault !== "object" || Array.isArray(fault)) {
    throw new ValidationError(`Rule at index ${ruleIndex} fault must be an object`, {
      ruleIndex,
      fault
    });
  }

  if (!fault.type || typeof fault.type !== "string" || !VALID_FAULT_TYPES.has(fault.type)) {
    throw new ValidationError(
      `Rule at index ${ruleIndex} has invalid or missing fault.type: ${fault.type}. Allowed: ${Array.from(VALID_FAULT_TYPES).join(", ")}`,
      { ruleIndex, type: fault.type }
    );
  }

  if (fault.type === "http-error") {
    const status = fault.status ?? 500;
    if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
      throw new ValidationError(
        `Rule at index ${ruleIndex} http-error status must be an integer between 100 and 599`,
        { ruleIndex, status }
      );
    }
    if (fault.statusText !== undefined && typeof fault.statusText !== "string") {
      throw new ValidationError(
        `Rule at index ${ruleIndex} http-error statusText must be a string`,
        { ruleIndex, statusText: fault.statusText }
      );
    }
  } else if (fault.type === "delay") {
    const delayMs = fault.delayMs;
    if (
      typeof delayMs !== "number" ||
      !Number.isFinite(delayMs) ||
      delayMs < 0 ||
      delayMs > MAX_DELAY_MS
    ) {
      throw new ValidationError(
        `Rule at index ${ruleIndex} delayMs must be a finite number between 0 and ${MAX_DELAY_MS}`,
        { ruleIndex, delayMs }
      );
    }
  } else if (fault.type === "timeout") {
    if (fault.timeoutMs !== undefined) {
      const timeoutMs = fault.timeoutMs;
      if (
        typeof timeoutMs !== "number" ||
        !Number.isFinite(timeoutMs) ||
        timeoutMs < 0 ||
        timeoutMs > MAX_DELAY_MS
      ) {
        throw new ValidationError(
          `Rule at index ${ruleIndex} timeoutMs must be a finite number between 0 and ${MAX_DELAY_MS}`,
          { ruleIndex, timeoutMs }
        );
      }
    }
  } else if (fault.type === "network-error") {
    if (fault.code !== undefined && typeof fault.code !== "string") {
      throw new ValidationError(`Rule at index ${ruleIndex} network-error code must be a string`, {
        ruleIndex,
        code: fault.code
      });
    }
  } else if (fault.type === "intermittent") {
    if (depth > 0) {
      throw new ValidationError(
        `Rule at index ${ruleIndex} nested intermittent faults are not allowed beyond depth 1`,
        { ruleIndex }
      );
    }
    const rate = fault.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new ValidationError(
        `Rule at index ${ruleIndex} intermittent rate must be a number between 0.0 and 1.0`,
        { ruleIndex, rate }
      );
    }
    if (!fault.fault || typeof fault.fault !== "object") {
      throw new ValidationError(
        `Rule at index ${ruleIndex} intermittent must define a target 'fault' object`,
        { ruleIndex }
      );
    }
    validateFault(fault.fault, ruleIndex, depth + 1);
  }
}
