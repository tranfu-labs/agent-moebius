import { GITHUB_CLI_RETRY_POLICY } from "./config.js";
import { log } from "./log.js";

export type GhErrorClass = "transient" | "deterministic";

export interface RetryPolicy {
  retries: number;
  minTimeoutMs: number;
  maxTimeoutMs: number;
  factor: number;
}

export interface WithRetryOptions extends Partial<RetryPolicy> {
  label: string;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const DETERMINISTIC_PATTERNS: readonly RegExp[] = [
  /Could not resolve to an issue or pull request/i,
  /HTTP 40\d\b/,
  /HTTP 422\b/,
  /Bad credentials/i,
  /not logged into|gh auth login|authentication/i,
  /Resource not accessible|Must have admin/i,
  /\bENOENT\b|command not found/i,
];

const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /\bEOF\b/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EPIPE/i,
  /connection reset|connection refused|network is unreachable/i,
  /timeout|timed out/i,
  /TLS handshake|\btls:/i,
  /HTTP 5\d\d\b/,
  /\b(502|503|504)\b/,
  /rate limit|secondary rate limit|was submitted too quickly|abuse detection/i,
  /temporarily unavailable|Service Unavailable|Bad Gateway|Gateway Timeout/i,
];

function errorText(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const record = error as { stderr?: unknown; message?: unknown };
    const parts: string[] = [];
    if (typeof record.stderr === "string") {
      parts.push(record.stderr);
    }
    if (typeof record.message === "string") {
      parts.push(record.message);
    }
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  return String(error);
}

export function classifyGhError(error: unknown): GhErrorClass {
  const text = errorText(error);
  if (DETERMINISTIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return "deterministic";
  }

  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return "transient";
  }

  return "transient";
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortError(signal));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    timer.unref?.();

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) {
    return reason;
  }

  return new Error(typeof reason === "string" && reason.length > 0 ? reason : "aborted");
}

function backoffDelayMs(policy: RetryPolicy, attempt: number): number {
  const base = policy.minTimeoutMs * Math.pow(policy.factor, attempt - 1);
  const capped = Math.min(policy.maxTimeoutMs, base);
  // equal jitter: half fixed + half random, keeps retries from thundering together
  return Math.round(capped / 2 + Math.random() * (capped / 2));
}

export async function withRetry<T>(fn: () => Promise<T>, options: WithRetryOptions): Promise<T> {
  const policy: RetryPolicy = {
    retries: options.retries ?? GITHUB_CLI_RETRY_POLICY.retries,
    minTimeoutMs: options.minTimeoutMs ?? GITHUB_CLI_RETRY_POLICY.minTimeoutMs,
    maxTimeoutMs: options.maxTimeoutMs ?? GITHUB_CLI_RETRY_POLICY.maxTimeoutMs,
    factor: options.factor ?? GITHUB_CLI_RETRY_POLICY.factor,
  };
  const shouldRetry = options.shouldRetry ?? (() => true);
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    if (isAborted(options.signal)) {
      throw abortError(options.signal);
    }

    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      const exhausted = attempt > policy.retries;
      if (exhausted || !shouldRetry(error) || isAborted(options.signal)) {
        throw error;
      }

      const delayMs = backoffDelayMs(policy, attempt);
      log({
        event: "gh-retry-attempt",
        label: options.label,
        attempt,
        maxAttempts: policy.retries + 1,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs, options.signal);
    }
  }
}
