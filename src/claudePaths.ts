import * as os from 'os';
import * as path from 'path';

/**
 * Returns the base Claude Code configuration directory.
 * - macOS / Linux: ~/.claude
 * - Windows: %APPDATA%\claude
 */
export function getClaudeDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? os.homedir();
    return path.join(appData, 'claude');
  }
  return path.join(os.homedir(), '.claude');
}

/**
 * Returns the directory where Claude Code stores session PID files.
 * Each file is `{PID}.json` with session metadata.
 */
export function getSessionsDir(): string {
  return path.join(getClaudeDir(), 'sessions');
}

/**
 * Returns the directory where Claude Code stores project transcripts.
 * Transcripts live under `projects/{encoded-cwd}/{sessionId}.jsonl`.
 */
export function getProjectsDir(): string {
  return path.join(getClaudeDir(), 'projects');
}

/**
 * Encodes a working directory path for use in the Claude Code projects directory.
 * Replaces path separators with `-` (the same encoding Claude Code uses).
 */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[/\\]/g, '-');
}

/**
 * Returns the full path to a transcript JSONL file given a session ID and workspace CWD.
 */
export function getTranscriptPath(sessionId: string, cwd: string): string {
  return path.join(getProjectsDir(), encodeCwd(cwd), `${sessionId}.jsonl`);
}
