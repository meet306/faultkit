import { describe, it, expect } from "vitest";
import {
  extractRequestDetails,
  matchesPattern,
  matchesRequest
} from "../../src/matching/request-matcher.js";

describe("Request Extraction and Matching", () => {
  describe("extractRequestDetails", () => {
    it("should extract details from string URL", () => {
      const details = extractRequestDetails("https://api.stripe.com/v1/charges?limit=10", {
        method: "post",
        headers: { Authorization: "Bearer sec_123" }
      });

      expect(details.url.hostname).toBe("api.stripe.com");
      expect(details.url.pathname).toBe("/v1/charges");
      expect(details.url.searchParams.get("limit")).toBe("10");
      expect(details.method).toBe("POST");
      expect(details.headers.get("authorization")).toBe("Bearer sec_123");
    });

    it("should extract details from URL instance", () => {
      const myUrl = new URL("https://example.test/health");
      const details = extractRequestDetails(myUrl);

      expect(details.url.hostname).toBe("example.test");
      expect(details.url.pathname).toBe("/health");
      expect(details.method).toBe("GET");
    });

    it("should extract details from Request instance", () => {
      const req = new Request("https://service.local/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" }
      });
      const details = extractRequestDetails(req);

      expect(details.url.hostname).toBe("service.local");
      expect(details.url.pathname).toBe("/data");
      expect(details.method).toBe("PUT");
      expect(details.headers.get("content-type")).toBe("application/json");
    });

    it("should handle relative URLs safely with localhost base", () => {
      const details = extractRequestDetails("/local-path?debug=true");
      expect(details.url.hostname).toBe("localhost");
      expect(details.url.pathname).toBe("/local-path");
      expect(details.url.searchParams.get("debug")).toBe("true");
    });
  });

  describe("matchesPattern", () => {
    it("should match exact strings case-insensitively", () => {
      expect(matchesPattern("example.com", "example.com")).toBe(true);
      expect(matchesPattern("EXAMPLE.COM", "example.com")).toBe(true);
      expect(matchesPattern("other.com", "example.com")).toBe(false);
    });

    it("should support wildcard hostnames (*.domain.com)", () => {
      expect(matchesPattern("api.example.com", "*.example.com", true)).toBe(true);
      expect(matchesPattern("payments.staging.example.com", "*.example.com", true)).toBe(true);
      expect(matchesPattern("example.com", "*.example.com", true)).toBe(true);
      expect(matchesPattern("other.com", "*.example.com", true)).toBe(false);
    });

    it("should match regular expressions", () => {
      expect(matchesPattern("/v1/users/42", /^\/v1\/users\/\d+$/)).toBe(true);
      expect(matchesPattern("/v1/users/abc", /^\/v1\/users\/\d+$/)).toBe(false);
    });

    it("should match custom predicate functions and handle errors safely", () => {
      expect(matchesPattern("active", (val) => val.startsWith("act"))).toBe(true);
      expect(matchesPattern("inactive", (val) => val.startsWith("act"))).toBe(false);
      expect(
        matchesPattern("value", () => {
          throw new Error("fail");
        })
      ).toBe(false);
    });
  });

  describe("matchesRequest", () => {
    const details = extractRequestDetails("https://api.payments.com/v2/orders?status=pending", {
      method: "POST",
      headers: {
        "x-api-version": "2024-01-01",
        Authorization: "Bearer token"
      }
    });

    it("should match when all specified criteria match", () => {
      const matchCriteria = {
        method: "POST",
        hostname: "api.payments.com",
        pathname: "/v2/orders",
        query: { status: "pending" },
        headers: { "x-api-version": "2024-01-01" }
      };
      expect(matchesRequest(details, matchCriteria)).toBe(true);
    });

    it("should match wildcard method or undefined criteria", () => {
      expect(matchesRequest(details, {})).toBe(true);
      expect(matchesRequest(details, undefined)).toBe(true);
      expect(matchesRequest(details, { method: "*" })).toBe(true);
    });

    it("should fail when method does not match", () => {
      expect(matchesRequest(details, { method: "GET" })).toBe(false);
    });

    it("should fail when hostname does not match", () => {
      expect(matchesRequest(details, { hostname: "other.com" })).toBe(false);
    });

    it("should fail when pathname does not match", () => {
      expect(matchesRequest(details, { pathname: "/v1/orders" })).toBe(false);
    });

    it("should fail when query does not match", () => {
      expect(matchesRequest(details, { query: { status: "completed" } })).toBe(false);
      expect(matchesRequest(details, { query: { missingKey: "any" } })).toBe(false);
    });

    it("should fail when headers do not match", () => {
      expect(matchesRequest(details, { headers: { "x-api-version": "2023-01-01" } })).toBe(false);
      expect(matchesRequest(details, { headers: { "missing-header": "true" } })).toBe(false);
    });
  });
});
