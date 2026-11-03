/**
 * @file Scenario creation and lifecycle orchestration.
 * @module faultkit/scenario/create-scenario
 */

import { validateScenarioOptions } from "../matching/rule-validation.js";
import { extractRequestDetails, matchesRequest } from "../matching/request-matcher.js";
import { ResourceTracker } from "../lifecycle/cleanup.js";
import { ScenarioReportCollector } from "../reporting/scenario-report.js";
import { createPRNG } from "../prng/seed.js";
import { registerActiveScenario, unregisterActiveScenario } from "../adapters/fetch.js";
import { executeScenario } from "./execute-scenario.js";
import { simulateHttpError } from "../faults/http-error.js";
import { simulateDelay } from "../faults/delay.js";
import { simulateTimeout } from "../faults/timeout.js";
import { simulateNetworkError } from "../faults/network-error.js";
import { evaluateIntermittent } from "../faults/intermittent.js";
import { ScenarioError, UnmatchedRequestError } from "../errors/faultkit-error.js";

/**
 * Scenario represents a named collection of fault-injection rules,
 * deterministic PRNG state, and lifecycle tracking.
 */
export class Scenario {
  /**
   * @param {import("../../types/index.d.ts").ScenarioOptions} [options={}]
   */
  constructor(options = {}) {
    validateScenarioOptions(options);

    this.name = options.name || "default-scenario";
    this.seed = options.seed ?? 123456789;
    this.passthrough = options.passthrough ?? true;
    this.recordMatches = options.recordMatches ?? true;
    this.redactHeaders = options.redactHeaders || [];

    // Clone rules with activation tracking
    /** @type {Array<any>} */
    this.rules = (options.rules || []).map((rule, idx) => ({
      index: idx,
      name: rule.name || `rule-${idx}`,
      match: rule.match ? { ...rule.match } : {},
      fault: { ...rule.fault },
      times: rule.times ?? Infinity,
      timesActivated: 0
    }));

    this.prng = createPRNG(this.seed);
    this.resourceTracker = new ResourceTracker();
    this.collector = new ScenarioReportCollector(this.name, this.rules, this.redactHeaders);
    this.isActive = false;
    this._isGloballyActive = false;
    this.isDisposed = false;
  }

  /**
   * Runs an asynchronous operation within the isolated context of this scenario.
   *
   * @template T
   * @param {() => Promise<T> | T} fn - Function to execute.
   * @returns {Promise<import("./scenario-result.js").ScenarioResult<T>>}
   */
  async run(fn) {
    return executeScenario(this, fn);
  }

  /**
   * Activates the scenario globally across the process.
   * Useful for test frameworks using beforeEach / afterEach hooks.
   * @returns {this}
   */
  activate() {
    if (this.isDisposed) {
      throw new ScenarioError(`Cannot activate disposed scenario "${this.name}".`, {
        scenarioName: this.name
      });
    }
    this.isActive = true;
    this._isGloballyActive = true;
    registerActiveScenario(this, true);
    return this;
  }

  /**
   * Deactivates the scenario globally.
   * @returns {this}
   */
  deactivate() {
    this.isActive = false;
    this._isGloballyActive = false;
    unregisterActiveScenario(this);
    return this;
  }

  /**
   * Cleans up all resources, clears active timers, and restores intercepted fetch if idle.
   * Safe to call multiple times.
   * @returns {Promise<import("../../types/index.d.ts").ScenarioReport>} The final scenario report.
   */
  async dispose() {
    if (this.isDisposed) {
      return this.collector.generateReport();
    }

    this.deactivate();
    const cleanupErrors = this.resourceTracker.dispose();
    this.collector.recordCleanup(cleanupErrors);
    this.isDisposed = true;

    return this.collector.generateReport();
  }

  /**
   * Resets all activation counters, PRNG, and diagnostic history.
   * @returns {this}
   */
  reset() {
    this.deactivate();
    this.resourceTracker.reset();
    this.collector.reset();
    this.prng = createPRNG(this.seed);
    this.isDisposed = false;

    for (const rule of this.rules) {
      rule.timesActivated = 0;
    }

    return this;
  }

  /**
   * Retrieves the current diagnostic report.
   * @returns {import("../../types/index.d.ts").ScenarioReport}
   */
  getReport() {
    return this.collector.generateReport();
  }

  /**
   * Handles an intercepted HTTP request.
   *
   * @param {string | URL | Request} input
   * @param {RequestInit} [init]
   * @param {typeof globalThis.fetch} [originalFetch]
   * @returns {Promise<Response>}
   */
  async handleRequest(input, init, originalFetch = globalThis.fetch) {
    const requestDetails = extractRequestDetails(input, init);

    // Find the first matching non-exhausted rule
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];

      if (rule.times !== Infinity && rule.timesActivated >= rule.times) {
        continue; // Rule exhausted
      }

      if (matchesRequest(requestDetails, rule.match)) {
        return await this._executeRuleFault(rule, requestDetails, input, init, originalFetch);
      }
    }

    // No rule matched or all matching rules exhausted
    if (this.passthrough) {
      return originalFetch.call(globalThis, input, init);
    }

    const unmatchedErr = new UnmatchedRequestError(
      `No active scenario rule matched request [${requestDetails.method}] ${requestDetails.url.href}`,
      {
        method: requestDetails.method,
        url: requestDetails.url.href,
        scenarioName: this.name
      }
    );
    throw unmatchedErr;
  }

  /**
   * Internal helper to execute a matched rule's fault.
   *
   * @private
   * @param {any} rule
   * @param {ReturnType<typeof extractRequestDetails>} requestDetails
   * @param {any} input
   * @param {any} init
   * @param {typeof globalThis.fetch} originalFetch
   * @returns {Promise<Response>}
   */
  async _executeRuleFault(rule, requestDetails, input, init, originalFetch) {
    let targetFault = rule.fault;

    // Handle intermittent wrapper
    if (targetFault.type === "intermittent") {
      const evaluation = evaluateIntermittent(targetFault, this.prng);
      if (!evaluation.triggered) {
        // Intermittent condition skipped fault execution
        rule.timesActivated++;
        if (this.recordMatches) {
          this.collector.recordEvent({
            method: requestDetails.method,
            url: requestDetails.url.href,
            ruleIndex: rule.index,
            faultType: "intermittent-skipped",
            faultTriggered: false,
            headers: requestDetails.headers
          });
        }
        // Allow request through
        return originalFetch.call(globalThis, input, init);
      }
      targetFault = evaluation.targetFault;
    }

    rule.timesActivated++;

    // Execute the fault based on type
    if (targetFault.type === "http-error") {
      const response = simulateHttpError(targetFault);
      if (this.recordMatches) {
        this.collector.recordEvent({
          method: requestDetails.method,
          url: requestDetails.url.href,
          ruleIndex: rule.index,
          faultType: "http-error",
          faultTriggered: true,
          status: response.status,
          headers: requestDetails.headers
        });
      }
      return response;
    }

    if (targetFault.type === "delay") {
      try {
        const response = await simulateDelay(
          targetFault,
          requestDetails.signal,
          this.resourceTracker
        );
        if (this.recordMatches) {
          this.collector.recordEvent({
            method: requestDetails.method,
            url: requestDetails.url.href,
            ruleIndex: rule.index,
            faultType: "delay",
            faultTriggered: true,
            status: response.status,
            headers: requestDetails.headers
          });
        }
        return response;
      } catch (err) {
        if (this.recordMatches) {
          this.collector.recordEvent({
            method: requestDetails.method,
            url: requestDetails.url.href,
            ruleIndex: rule.index,
            faultType: "delay",
            faultTriggered: true,
            error: err instanceof Error ? err.message : String(err),
            headers: requestDetails.headers
          });
        }
        throw err;
      }
    }

    if (targetFault.type === "timeout") {
      if (this.recordMatches) {
        this.collector.recordEvent({
          method: requestDetails.method,
          url: requestDetails.url.href,
          ruleIndex: rule.index,
          faultType: "timeout",
          faultTriggered: true,
          error: targetFault.message || "Request timed out",
          headers: requestDetails.headers
        });
      }
      await simulateTimeout(targetFault, requestDetails.signal, this.resourceTracker);
    }

    if (targetFault.type === "network-error") {
      if (this.recordMatches) {
        this.collector.recordEvent({
          method: requestDetails.method,
          url: requestDetails.url.href,
          ruleIndex: rule.index,
          faultType: "network-error",
          faultTriggered: true,
          error: targetFault.code || "ECONNRESET",
          headers: requestDetails.headers
        });
      }
      simulateNetworkError(targetFault);
    }

    // Default fallback (should not reach here)
    return originalFetch.call(globalThis, input, init);
  }
}

/**
 * Creates and validates a new FaultKit Scenario.
 *
 * @param {import("../../types/index.d.ts").ScenarioOptions} [options={}] - Scenario configuration.
 * @returns {Scenario}
 */
export function createScenario(options = {}) {
  return new Scenario(options);
}
