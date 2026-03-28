import * as https from 'https';

export interface UsageWindow {
  utilization: number;
  resets_at: string | null;
}

export interface UsageLimits {
  five_hour:            UsageWindow;
  seven_day:            UsageWindow;
  seven_day_opus:       UsageWindow | null;
  seven_day_oauth_apps?: UsageWindow | null;
  iguana_necktie?:      unknown;
}

export class RateLimitError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    public readonly statusCode: number,
  ) {
    super(`Rate limited (HTTP ${statusCode}). Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitError';
  }
}

const API_URL = 'https://api.anthropic.com/api/oauth/usage';
const REQUEST_TIMEOUT_MS = 10_000;

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
};

function parseRetryAfter(header: string | undefined): number | null {
  if (!header) { return null; }
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) { return seconds * 1000; }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const ms = date - Date.now();
    return ms > 0 ? ms : null;
  }
  return null;
}

function singleRequest(accessToken: string): Promise<{ status: number; headers: Record<string, string | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      API_URL,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': 'claude-code/2.0.32',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: {
              'retry-after': res.headers['retry-after'] as string | undefined,
            },
            body: data,
          });
        });
      }
    );

    req.on('error', reject);

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Request timed out'));
    });

    req.end();
  });
}

/**
 * Fetches the current usage limits from the Anthropic API.
 * Retries up to 3 times on 429/5xx with exponential backoff.
 * Respects the `retry-after` header when present.
 * IMPORTANT: The token is used only in-memory and never logged.
 */
export async function fetchUsage(accessToken: string, retryOpts?: Partial<RetryOptions>): Promise<UsageLimits> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY, ...retryOpts };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const res = await singleRequest(accessToken);

      if (res.status === 200) {
        return JSON.parse(res.body) as UsageLimits;
      }

      if (res.status === 429) {
        const retryAfterMs = parseRetryAfter(res.headers['retry-after'])
          ?? baseDelayMs * 2 ** attempt;
        if (attempt === maxRetries) {
          throw new RateLimitError(retryAfterMs, res.status);
        }
        await new Promise(r => setTimeout(r, retryAfterMs));
        continue;
      }

      if (res.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`API returned HTTP ${res.status}`);
        continue;
      }

      throw new Error(`API returned HTTP ${res.status}`);
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof SyntaxError) { throw err; }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) { break; }
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}
