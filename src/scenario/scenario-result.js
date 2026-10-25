/**
 * @file Scenario execution result wrapper.
 * @module faultkit/scenario/scenario-result
 */

/**
 * Encapsulates the return value of a scenario run and its diagnostic report.
 * @template T
 */
export class ScenarioResult {
  /**
   * @param {string} scenarioName
   * @param {T} result - The value returned by user-supplied callback.
   * @param {import("../../types/index.d.ts").ScenarioReport} report - The diagnostic summary report.
   */
  constructor(scenarioName, result, report) {
    this.scenarioName = scenarioName;
    this.result = result;
    this.report = report;
  }

  /** @returns {number} */
  get matchedCount() {
    return this.report.matchedCount;
  }

  /** @returns {number} */
  get faultsTriggered() {
    return this.report.faultsTriggered;
  }

  /** @returns {number} */
  get durationMs() {
    return this.report.durationMs;
  }

  /** @returns {import("../../types/index.d.ts").RuleSummary[]} */
  get rules() {
    return this.report.rules;
  }

  /** @returns {import("../../types/index.d.ts").DiagnosticEvent[]} */
  get events() {
    return this.report.events;
  }

  /** @returns {import("../../types/index.d.ts").CleanupOutcome} */
  get cleanup() {
    return this.report.cleanup;
  }
}
