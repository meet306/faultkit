/**
 * @file Privacy-conscious scenario diagnostics and reporting collector.
 * @module faultkit/reporting/scenario-report
 */

export const DEFAULT_REDACTED_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "token"
];

/**
 * Redacts sensitive header names from a given Headers instance or plain object.
 * Returns an object with null prototype to avoid prototype pollution.
 *
 * @param {Headers | Record<string, string>} headers
 * @param {string[]} [customRedactions=[]]
 * @returns {Record<string, string>} Sanitized headers object with null prototype.
 */
export function redactHeaders(headers, customRedactions = []) {
  const sensitiveSet = new Set(
    [...DEFAULT_REDACTED_HEADERS, ...customRedactions].map((h) => h.toLowerCase())
  );

  /** @type {Record<string, string>} */
  const result = Object.create(null);

  if (!headers) {
    return result;
  }

  if (headers instanceof Headers) {
    for (const [key, val] of headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "__proto__" || lowerKey === "prototype" || lowerKey === "constructor") {
        continue;
      }
      result[lowerKey] = sensitiveSet.has(lowerKey) ? "[REDACTED]" : val;
    }
  } else if (typeof headers === "object") {
    for (const [key, val] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "__proto__" || lowerKey === "prototype" || lowerKey === "constructor") {
        continue;
      }
      result[lowerKey] = sensitiveSet.has(lowerKey) ? "[REDACTED]" : String(val);
    }
  }

  return result;
}

/**
 * Collects execution events, match counts, and diagnostic telemetry for a scenario.
 */
export class ScenarioReportCollector {
  /**
   * @param {string} scenarioName
   * @param {Array<any>} [rules=[]]
   * @param {string[]} [redactHeaderList=[]]
   */
  constructor(scenarioName, rules = [], redactHeaderList = []) {
    this.scenarioName = scenarioName;
    this.rules = rules;
    this.redactHeaderList = redactHeaderList;
    this.startTime = Date.now();
    /** @type {number | null} */
    this.endTime = null;
    this.matchedCount = 0;
    this.faultsTriggered = 0;
    /** @type {number[]} */
    this.ruleActivationCounts = new Array(rules.length).fill(0);
    /** @type {Array<any>} */
    this.events = [];
    /** @type {{ success: boolean, errors: string[] }} */
    this.cleanupOutcome = { success: true, errors: [] };
  }

  /**
   * Records a request match and fault execution.
   *
   * @param {object} event
   * @param {string} event.method
   * @param {string} event.url
   * @param {number} event.ruleIndex
   * @param {string} event.faultType
   * @param {boolean} event.faultTriggered
   * @param {number} [event.status]
   * @param {string} [event.error]
   * @param {Headers | Record<string, string>} [event.headers]
   */
  recordEvent(event) {
    this.matchedCount++;
    if (event.faultTriggered) {
      this.faultsTriggered++;
    }

    if (event.ruleIndex >= 0 && event.ruleIndex < this.ruleActivationCounts.length) {
      this.ruleActivationCounts[event.ruleIndex]++;
    }

    this.events.push({
      timestamp: Date.now(),
      method: event.method,
      url: event.url,
      ruleIndex: event.ruleIndex,
      faultType: event.faultType,
      faultTriggered: event.faultTriggered,
      status: event.status,
      error: event.error,
      headers: event.headers
        ? redactHeaders(event.headers, this.redactHeaderList)
        : Object.create(null)
    });
  }

  /**
   * Marks cleanup outcome.
   * @param {Array<Error>} errors
   */
  recordCleanup(errors = []) {
    this.endTime = Date.now();
    if (errors.length > 0) {
      this.cleanupOutcome = {
        success: false,
        errors: errors.map((e) => e.message || String(e))
      };
    } else {
      this.cleanupOutcome = { success: true, errors: [] };
    }
  }

  /**
   * Builds the final immutable scenario report object.
   * @returns {import("../../types/index.d.ts").ScenarioReport}
   */
  generateReport() {
    const durationMs = (this.endTime || Date.now()) - this.startTime;

    /** @type {import("../../types/index.d.ts").RuleSummary[]} */
    const ruleSummaries = this.rules.map((rule, idx) => ({
      index: idx,
      name: (rule && rule.name) || `rule-${idx}`,
      timesConfigured: (rule && rule.times) ?? Infinity,
      timesActivated: this.ruleActivationCounts[idx] || 0,
      exhausted:
        Boolean(rule) &&
        rule.times !== undefined &&
        rule.times !== Infinity &&
        (this.ruleActivationCounts[idx] || 0) >= rule.times
    }));

    return {
      scenarioName: this.scenarioName,
      matchedCount: this.matchedCount,
      faultsTriggered: this.faultsTriggered,
      durationMs,
      rules: ruleSummaries,
      events: [...this.events],
      cleanup: { ...this.cleanupOutcome }
    };
  }

  /**
   * Resets metrics.
   */
  reset() {
    this.startTime = Date.now();
    this.endTime = null;
    this.matchedCount = 0;
    this.faultsTriggered = 0;
    this.ruleActivationCounts = new Array(this.rules.length).fill(0);
    this.events = [];
    this.cleanupOutcome = { success: true, errors: [] };
  }
}
