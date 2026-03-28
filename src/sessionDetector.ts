import * as fs from 'fs';
import * as path from 'path';
import { getSessionsDir, getTranscriptPath } from './claudePaths';
import type { SessionInfo } from './sidebar/types';

interface SessionFileContent {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind?: string;
  entrypoint?: string;
}

/**
 * Checks whether a given PID is still running.
 * Uses `process.kill(pid, 0)` which sends no signal but throws if the process
 * does not exist.
 */
function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects active Claude Code sessions for the given workspace path.
 *
 * Reads all `*.json` files under `~/.claude/sessions/`, filters by:
 * 1. `cwd` matching the provided workspace path
 * 2. PID still running (via `process.kill(pid, 0)`)
 *
 * Returns matching sessions sorted by `startedAt` descending (most recent first).
 * Returns an empty array if no sessions directory exists or no matches are found.
 */
export function detectSessions(workspacePath: string): SessionInfo[] {
  const sessionsDir = getSessionsDir();

  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }

  const sessions: SessionInfo[] = [];

  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    let content: SessionFileContent;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      content = JSON.parse(raw) as SessionFileContent;
    } catch {
      continue;
    }

    // Match workspace path (normalize trailing slashes for comparison)
    const normalizedCwd = content.cwd?.replace(/[/\\]+$/, '') ?? '';
    const normalizedWorkspace = workspacePath.replace(/[/\\]+$/, '');
    if (normalizedCwd !== normalizedWorkspace) { continue; }

    // Validate PID is still running
    if (!content.pid || !isPidRunning(content.pid)) { continue; }

    const transcriptPath = getTranscriptPath(content.sessionId, content.cwd);

    sessions.push({
      pid: content.pid,
      sessionId: content.sessionId,
      projectPath: content.cwd,
      transcriptPath,
      startedAt: new Date(content.startedAt),
    });
  }

  // Sort by startedAt descending (most recent first)
  sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  return sessions;
}
