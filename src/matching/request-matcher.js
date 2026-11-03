/**
 * @file Request extraction and rule matching engine.
 * @module faultkit/matching/request-matcher
 */

/**
 * Normalizes an input (string, URL, or Request) and optional RequestInit into standard components.
 *
 * @param {string | URL | Request} input - Request input.
 * @param {RequestInit} [init] - Optional request init options.
 * @returns {{ url: URL, method: string, headers: Headers, signal?: AbortSignal }}
 */
export function extractRequestDetails(input, init) {
  let urlStr;
  let method = "GET";
  /** @type {Headers} */
  let headers = new Headers();
  /** @type {AbortSignal | undefined} */
  let signal;

  if (typeof input === "string") {
    urlStr = input;
  } else if (input instanceof URL) {
    urlStr = input.toString();
  } else if (input && typeof input === "object" && "url" in input) {
    // Request object
    urlStr = input.url;
    method = input.method || "GET";
    headers = new Headers(input.headers);
    signal = input.signal;
  } else {
    urlStr = String(input);
  }

  if (init) {
    if (init.method) {
      method = init.method;
    }
    // Per WHATWG fetch spec, init.headers replaces input.headers
    if (init.headers !== undefined) {
      headers = new Headers(init.headers);
    }
    if (init.signal) {
      signal = init.signal;
    }
  }

  // Parse URL safely without throwing unhandled exceptions
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    try {
      // Relative URL fallback for local requests
      url = new URL(urlStr, "http://localhost");
    } catch {
      url = new URL("http://localhost/malformed-request");
    }
  }

  return {
    url,
    method: method.toUpperCase(),
    headers,
    signal
  };
}

/**
 * Evaluates whether a target string matches a pattern (string, RegExp, or predicate).
 *
 * @param {string} target
 * @param {string | RegExp | ((val: string) => boolean)} pattern
 * @param {boolean} [wildcardSupport=false]
 * @returns {boolean}
 */
export function matchesPattern(target, pattern, wildcardSupport = false) {
  if (typeof pattern === "string") {
    if (pattern === "*") {
      return true;
    }
    if (wildcardSupport) {
      if (pattern.startsWith("*.")) {
        const suffix = pattern.slice(1).toLowerCase(); // e.g. .example.com
        return (
          target.toLowerCase().endsWith(suffix) ||
          target.toLowerCase() === pattern.slice(2).toLowerCase()
        );
      }
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -1).toLowerCase(); // e.g. /api/
        return (
          target.toLowerCase().startsWith(prefix) ||
          target.toLowerCase() === pattern.slice(0, -2).toLowerCase()
        );
      }
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1).toLowerCase();
        return target.toLowerCase().startsWith(prefix);
      }
    }
    return target.toLowerCase() === pattern.toLowerCase();
  }

  if (pattern instanceof RegExp) {
    // Reset stateful regular expressions (global and sticky flags) to avoid alternating matching failures
    if (pattern.global || pattern.sticky) {
      pattern.lastIndex = 0;
    }
    return pattern.test(target);
  }

  if (typeof pattern === "function") {
    try {
      return Boolean(pattern(target));
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Determines whether an incoming request matches a rule's match criteria.
 *
 * @param {{ url: URL, method: string, headers: Headers }} requestDetails
 * @param {Record<string, any>} [matchCriteria]
 * @returns {boolean}
 */
export function matchesRequest(requestDetails, matchCriteria) {
  // If no match criteria specified, match all requests
  if (!matchCriteria || Object.keys(matchCriteria).length === 0) {
    return true;
  }

  const { url, method, headers } = requestDetails;

  // 1. Method match
  if (matchCriteria.method !== undefined && matchCriteria.method !== "*") {
    if (method !== matchCriteria.method.toUpperCase()) {
      return false;
    }
  }

  // 2. Hostname match
  if (matchCriteria.hostname !== undefined) {
    if (!matchesPattern(url.hostname, matchCriteria.hostname, true)) {
      return false;
    }
  }

  // 3. Pathname match
  if (matchCriteria.pathname !== undefined) {
    if (!matchesPattern(url.pathname, matchCriteria.pathname, true)) {
      return false;
    }
  }

  // 4. Query parameters match
  if (matchCriteria.query !== undefined && typeof matchCriteria.query === "object") {
    for (const [key, expectedValue] of Object.entries(matchCriteria.query)) {
      const actualValue = url.searchParams.get(key);
      if (actualValue === null) {
        return false;
      }
      if (!matchesPattern(actualValue, expectedValue, false)) {
        return false;
      }
    }
  }

  // 5. Headers match
  if (matchCriteria.headers !== undefined && typeof matchCriteria.headers === "object") {
    for (const [key, expectedValue] of Object.entries(matchCriteria.headers)) {
      const actualValue = headers.get(key);
      if (actualValue === null) {
        return false;
      }
      if (!matchesPattern(actualValue, expectedValue, false)) {
        return false;
      }
    }
  }

  return true;
}
