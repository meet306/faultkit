/**
 * @file Scoped scenario runner with AsyncLocalStorage.
 * @module faultkit/scenario/execute-scenario
 */

import {
  scenarioStorage,
  registerActiveScenario,
  unregisterActiveScenario
} from "../adapters/fetch.js";
import { ScenarioError, ValidationError } from "../errors/faultkit-error.js";
import { ScenarioResult } from "./scenario-result.js";

/**
 * Runs an asynchronous function within the isolated context of a scenario.
 *
 * @template T
 * @param {import("./create-scenario.js").Scenario} scenario - Target scenario instance.
 * @param {() => Promise<T> | T} fn - Test callback to execute.
 * @returns {Promise<ScenarioResult<T>>}
 * @throws {ScenarioError | ValidationError | Error}
 */
export async function executeScenario(scenario, fn) {
  if (typeof fn !== "function") {
    throw new ValidationError("scenario.run requires a callback function", { fn });
  }

  if (scenario.isDisposed) {
    throw new ScenarioError(
      `Cannot run disposed scenario "${scenario.name}". Create a new scenario or call reset().`,
      { scenarioName: scenario.name }
    );
  }

  scenario.isActive = true;
  // Ensure the resource tracker is active for this execution run
  scenario.resourceTracker.isDisposed = false;
  registerActiveScenario(scenario, false);

  try {
    const result = await scenarioStorage.run({ scenario }, async () => {
      return await fn();
    });

    const cleanupErrors = scenario.resourceTracker.dispose();
    scenario.collector.recordCleanup(cleanupErrors);
    // If the scenario instance itself was not explicitly disposed, allow future runs
    if (!scenario.isDisposed) {
      scenario.resourceTracker.isDisposed = false;
    }

    return new ScenarioResult(scenario.name, result, scenario.collector.generateReport());
  } catch (err) {
    const cleanupErrors = scenario.resourceTracker.dispose();
    scenario.collector.recordCleanup(cleanupErrors);
    if (!scenario.isDisposed) {
      scenario.resourceTracker.isDisposed = false;
    }
    throw err;
  } finally {
    if (!scenario._isGloballyActive) {
      scenario.isActive = false;
    }
    unregisterActiveScenario(scenario);
  }
}
