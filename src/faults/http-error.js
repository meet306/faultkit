/**
 * @file HTTP error response simulator.
 * @module faultkit/faults/http-error
 */

/**
 * Creates a standard Response object representing an HTTP error or custom status.
 *
 * @param {object} faultConfig
 * @param {number} [faultConfig.status=500] - HTTP status code.
 * @param {string} [faultConfig.statusText] - HTTP status text.
 * @param {Record<string, string>} [faultConfig.headers] - Custom response headers.
 * @param {string | object | null} [faultConfig.body] - Optional response payload.
 * @returns {Response}
 */
export function simulateHttpError(faultConfig = {}) {
  const status = faultConfig.status ?? 500;
  const statusText = faultConfig.statusText;
  const headers = new Headers(faultConfig.headers);

  const body = faultConfig.body;
  let bodyPayload = null;

  // 204 and 304 status codes cannot have a body per fetch spec
  if (status !== 204 && status !== 304 && body !== undefined && body !== null) {
    if (typeof body === "object") {
      bodyPayload = JSON.stringify(body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    } else {
      bodyPayload = String(body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "text/plain; charset=utf-8");
      }
    }
  }

  /** @type {ResponseInit} */
  const responseInit = {
    status,
    headers
  };

  if (statusText !== undefined) {
    responseInit.statusText = statusText;
  }

  return new Response(bodyPayload, responseInit);
}
