/**
 * @file Fetch interception adapter with AsyncLocalStorage isolation.
 * @module faultkit/adapters/fetch
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** @type {AsyncLocalStorage<{ scenario: any }>} */
export const scenarioStorage = new AsyncLocalStorage();

/** @type {typeof globalThis.fetch} */
const systemNativeFetch = globalThis.fetch;

/** @type {typeof globalThis.fetch | null} */
let originalFetch = null;

/** @type {boolean} */
let isPatched = false;

/** @type {Set<any>} */
const activeScenarios = new Set();

/** @type {any[]} */
const globalActiveScenarios = [];

/**
 * Returns whether global fetch is currently intercepted.
 * @returns {boolean}
 */
export function isFetchPatched() {
  return isPatched;
}

/**
 * Returns the original unpatched globalThis.fetch function.
 * @returns {typeof globalThis.fetch}
 */
export function getOriginalFetch() {
  return originalFetch || systemNativeFetch;
}

/**
 * Ensures global fetch is patched with the FaultKit interceptor proxy.
 * Idempotent. Does nothing if already patched.
 */
export function ensureFetchPatched() {
  if (isPatched) {
    return;
  }

  originalFetch = globalThis.fetch;

  globalThis.fetch = async function faultkitFetchProxy(input, init) {
    const fallbackFetch = originalFetch || systemNativeFetch;

    // 1. Scoped async context takes precedence (for scenario.run)
    const store = scenarioStorage.getStore();
    let targetScenario = store?.scenario;

    // 2. Global active scenario fallback (for manual scenario.activate)
    if (!targetScenario && globalActiveScenarios.length > 0) {
      for (let i = globalActiveScenarios.length - 1; i >= 0; i--) {
        const candidate = globalActiveScenarios[i];
        if (candidate?.isActive && !candidate?.isDisposed) {
          targetScenario = candidate;
          break;
        }
      }
    }

    // 3. If no active scenario, passthrough to real fetch
    if (!targetScenario || !targetScenario.isActive) {
      return fallbackFetch.call(globalThis, input, init);
    }

    // 4. Delegate to the active scenario
    return targetScenario.handleRequest(input, init, fallbackFetch);
  };

  isPatched = true;
}

/**
 * Restores the original globalThis.fetch if no active scenarios remain.
 */
export function restoreFetchIfIdle() {
  if (!isPatched) {
    return;
  }

  if (activeScenarios.size === 0 && globalActiveScenarios.length === 0) {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = null;
    }
    isPatched = false;
  }
}

/**
 * Registers an active scenario.
 * @param {any} scenario
 * @param {boolean} [isGlobal=false]
 */
export function registerActiveScenario(scenario, isGlobal = false) {
  ensureFetchPatched();
  activeScenarios.add(scenario);
  if (isGlobal && !globalActiveScenarios.includes(scenario)) {
    globalActiveScenarios.push(scenario);
  }
}

/**
 * Unregisters an active scenario and restores fetch if all scenarios are idle.
 * @param {any} scenario
 */
export function unregisterActiveScenario(scenario) {
  activeScenarios.delete(scenario);
  const idx = globalActiveScenarios.indexOf(scenario);
  if (idx !== -1) {
    globalActiveScenarios.splice(idx, 1);
  }
  restoreFetchIfIdle();
}

/**
 * Force-restores global fetch unconditionally (primarily for test suite teardown).
 */
export function forceRestoreFetch() {
  activeScenarios.clear();
  globalActiveScenarios.length = 0;
  if (isPatched && originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
    isPatched = false;
  }
}
