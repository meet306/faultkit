/**
 * TypeScript definitions for FaultKit.
 */

export const VERSION: string;

export interface HttpErrorFault {
  type: "http-error";
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | object | null;
}

export interface DelayFault {
  type: "delay";
  delayMs: number;
  response?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string | object | null;
  };
}

export interface TimeoutFault {
  type: "timeout";
  timeoutMs?: number;
  message?: string;
}

export interface NetworkErrorFault {
  type: "network-error";
  code?: string;
  message?: string;
  causeMessage?: string;
}

export interface IntermittentFault {
  type: "intermittent";
  rate: number;
  fault: HttpErrorFault | DelayFault | TimeoutFault | NetworkErrorFault;
}

export type FaultDefinition =
  HttpErrorFault | DelayFault | TimeoutFault | NetworkErrorFault | IntermittentFault;

export interface MatchCriteria {
  method?: string;
  hostname?: string | RegExp | ((hostname: string) => boolean);
  pathname?: string | RegExp | ((pathname: string) => boolean);
  query?: Record<string, string | RegExp | ((val: string) => boolean)>;
  headers?: Record<string, string | RegExp | ((val: string) => boolean)>;
}

export interface RuleOptions {
  name?: string;
  match?: MatchCriteria;
  fault: FaultDefinition;
  times?: number;
}

export interface ScenarioOptions {
  name?: string;
  rules?: RuleOptions[];
  seed?: number;
  passthrough?: boolean;
  recordMatches?: boolean;
  redactHeaders?: string[];
}

export interface RuleSummary {
  index: number;
  name: string;
  timesConfigured: number;
  timesActivated: number;
  exhausted: boolean;
}

export interface DiagnosticEvent {
  timestamp: number;
  method: string;
  url: string;
  ruleIndex: number;
  faultType: string;
  faultTriggered: boolean;
  status?: number;
  error?: string;
  headers: Record<string, string>;
}

export interface CleanupOutcome {
  success: boolean;
  errors: string[];
}

export interface ScenarioReport {
  scenarioName: string;
  matchedCount: number;
  faultsTriggered: number;
  durationMs: number;
  rules: RuleSummary[];
  events: DiagnosticEvent[];
  cleanup: CleanupOutcome;
}

export class ScenarioResult<T = any> {
  scenarioName: string;
  result: T;
  report: ScenarioReport;
  constructor(scenarioName: string, result: T, report: ScenarioReport);
  get matchedCount(): number;
  get faultsTriggered(): number;
  get durationMs(): number;
  get rules(): RuleSummary[];
  get events(): DiagnosticEvent[];
  get cleanup(): CleanupOutcome;
}

export class Scenario {
  name: string;
  seed: number;
  passthrough: boolean;
  recordMatches: boolean;
  redactHeaders: string[];
  isActive: boolean;
  isDisposed: boolean;

  constructor(options?: ScenarioOptions);
  run<T>(fn: () => Promise<T> | T): Promise<ScenarioResult<T>>;
  activate(): this;
  deactivate(): this;
  dispose(): Promise<ScenarioReport>;
  reset(): this;
  getReport(): ScenarioReport;
  handleRequest(
    input: string | URL | Request,
    init?: RequestInit,
    originalFetch?: typeof globalThis.fetch
  ): Promise<Response>;
}

export function createScenario(options?: ScenarioOptions): Scenario;

export class FaultKitError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(message: string, code?: string, details?: Record<string, unknown>);
}

export class ValidationError extends FaultKitError {
  constructor(message: string, details?: Record<string, unknown>);
}

export class ScenarioError extends FaultKitError {
  constructor(message: string, details?: Record<string, unknown>);
}

export class FaultSimulationError extends FaultKitError {
  constructor(message: string, details?: Record<string, unknown>);
}

export class UnmatchedRequestError extends FaultKitError {
  constructor(message: string, details?: Record<string, unknown>);
}

export function validateScenarioOptions(options: Record<string, any>): void;
export function validateRule(rule: Record<string, any>, index?: number): void;

export function extractRequestDetails(
  input: string | URL | Request,
  init?: RequestInit
): { url: URL; method: string; headers: Headers; signal?: AbortSignal };

export function matchesPattern(
  target: string,
  pattern: string | RegExp | ((val: string) => boolean),
  wildcardSupport?: boolean
): boolean;

export function matchesRequest(
  requestDetails: { url: URL; method: string; headers: Headers },
  matchCriteria?: MatchCriteria
): boolean;

export function isFetchPatched(): boolean;
export function getOriginalFetch(): typeof globalThis.fetch;
export function forceRestoreFetch(): void;

export const DEFAULT_REDACTED_HEADERS: string[];
export function sanitizeUrl(urlStr: string): string;
export function redactHeaders(
  headers: Headers | Record<string, string> | [string, string][],
  customRedactions?: string[]
): Record<string, string>;

export function createPRNG(seed?: number): () => number;
