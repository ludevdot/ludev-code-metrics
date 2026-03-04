import * as https from 'https';

export interface SkillResult {
  name: string;
  description: string;
  url: string;
  author?: string;
  tags?: string[];
}

export interface SkillsSearchResponse {
  results: SkillResult[];
  total: number;
}

const SKILLS_API_BASE = 'https://skills.sh/api/search';

/**
 * Searches for skills using the skills.sh API.
 * Requires a minimum of 2 characters in the query.
 */
export function searchSkills(query: string): Promise<SkillsSearchResponse> {
  if (query.length < 2) {
    return Promise.reject(new Error('Query must be at least 2 characters'));
  }

  const encodedQuery = encodeURIComponent(query);
  const url = `${SKILLS_API_BASE}?q=${encodedQuery}&limit=50`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: 'GET', headers: { 'Accept': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`skills.sh API returned HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data) as SkillsSearchResponse);
          } catch {
            reject(new Error('Failed to parse skills.sh API response'));
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
