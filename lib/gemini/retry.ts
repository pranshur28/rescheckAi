// Retry wrapper for Gemini API calls. Targets the transient overload errors
// (503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED) that periodically hit the public
// Gemini endpoint during peak hours. Non-transient failures (auth, malformed
// prompts, schema mismatches) fail fast on the first attempt — retrying those
// just burns the route's 60s maxDuration budget.

const TRANSIENT_PATTERNS: RegExp[] = [
  /"code"\s*:\s*503\b/,
  /"code"\s*:\s*429\b/,
  /"status"\s*:\s*"UNAVAILABLE"/i,
  /"status"\s*:\s*"RESOURCE_EXHAUSTED"/i,
  /"status"\s*:\s*"DEADLINE_EXCEEDED"/i,
];

export function isTransientGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return TRANSIENT_PATTERNS.some((p) => p.test(err.message));
}

export interface WithRetryOpts {
  maxAttempts?: number;
  delayMs?: number;
  label?: string;
}

// 1 retry default keeps us under the route's 60s maxDuration even when Pass 2
// itself takes ~25s. Bumping to 2 retries risks the function getting killed
// mid-second-retry.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOpts = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const delayMs = opts.delayMs ?? 2_000;
  const label = opts.label ?? "gemini-call";

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransientGeminiError(err)) {
        throw err;
      }
      console.warn(
        `[gemini-retry] ${label} attempt ${attempt}/${maxAttempts} hit transient error, retrying in ${delayMs}ms: ${(err as Error).message.slice(0, 160)}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
