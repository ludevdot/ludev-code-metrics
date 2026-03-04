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

const API_URL = 'https://api.anthropic.com/api/oauth/usage';

/**
 * Fetches the current usage limits from the Anthropic API.
 * Rejects on non-200 responses, parse errors, network errors, or timeout.
 * IMPORTANT: The token is used only in-memory and never logged.
 */
export function fetchUsage(accessToken: string): Promise<UsageLimits> {
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
          if (res.statusCode !== 200) {
            reject(new Error(`API returned HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data) as UsageLimits);
          } catch {
            reject(new Error('Failed to parse API response'));
          }
        });
      }
    );

    req.on('error', reject);

    req.setTimeout(10_000, () => {
      req.destroy(new Error('Request timed out'));
    });

    req.end();
  });
}
