import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';

export interface SkillResult {
  id: string;        // "owner/repo/skillId"
  skillId: string;   // "skill-name"
  name: string;
  installs: number;
  source: string;    // "owner/repo"
}

export interface SkillsSearchResponse {
  query: string;
  skills: SkillResult[];
  count: number;
}

const SKILLS_API_BASE = 'https://skills.sh/api/search';

const CACHE_KEY = 'skillsCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface SkillsCache {
  cachedAt: number;
  skills: SkillResult[];
}

export function loadCache(context: vscode.ExtensionContext): SkillResult[] | null {
  const cache = context.globalState.get<SkillsCache>(CACHE_KEY);
  if (!cache) { return null; }
  if (Date.now() - cache.cachedAt > CACHE_TTL_MS) { return null; }
  return cache.skills;
}

export function saveCache(context: vscode.ExtensionContext, skills: SkillResult[]): void {
  context.globalState.update(CACHE_KEY, { cachedAt: Date.now(), skills });
}

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

/**
 * Downloads a skill's SKILL.md from GitHub raw and installs it into
 * .claude/skills/<skillId>/SKILL.md, then updates skills-lock.json.
 */
export async function installSkill(
  skill: SkillResult,
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    throw new Error('No workspace folder open');
  }

  const [owner, repo] = skill.source.split('/');
  const content = await fetchSkillMd(owner, repo, skill.skillId);

  // Write SKILL.md
  const skillDir = path.join(workspaceRoot, '.claude', 'skills', skill.skillId);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

  // Update skills-lock.json
  const lockPath = path.join(workspaceRoot, 'skills-lock.json');
  const lock: Record<string, unknown> = fs.existsSync(lockPath)
    ? JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
    : {};

  lock[skill.skillId] = {
    source: skill.source,
    sourceType: 'github',
    computedHash: crypto.createHash('sha256').update(content).digest('hex'),
  };

  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2), 'utf-8');

  // Update cache to include the newly installed skill
  const cached = loadCache(context) ?? [];
  if (!cached.find(s => s.skillId === skill.skillId)) {
    saveCache(context, [...cached, skill]);
  }
}

// Candidate paths in order of prevalence across public skill repos
const SKILL_PATH_CANDIDATES = [
  (skillId: string) => `skills/${skillId}/SKILL.md`,
  (skillId: string) => `${skillId}/SKILL.md`,
  (skillId: string) => `skills/${skillId}.md`,
  (skillId: string) => `${skillId}.md`,
];

export async function fetchSkillMd(owner: string, repo: string, skillId: string): Promise<string> {
  for (const candidate of SKILL_PATH_CANDIDATES) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${candidate(skillId)}`;
    try {
      return await fetchText(url);
    } catch {
      // try next candidate
    }
  }
  throw new Error(`SKILL.md not found for ${owner}/${repo}/${skillId}`);
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET' }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        resolve(fetchText(res.headers.location!));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}
