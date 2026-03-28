import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectSessions } from '../sessionDetector';
import * as claudePaths from '../claudePaths';

let tmpDir: string;
let sessionsDir: string;

// Mock claudePaths to use our temp directory
vi.mock('../claudePaths', async () => {
  const actual = await vi.importActual('../claudePaths') as typeof import('../claudePaths');
  return {
    ...actual,
    getSessionsDir: vi.fn(),
    getTranscriptPath: vi.fn().mockReturnValue('/mock/transcript.jsonl'),
  };
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
  sessionsDir = path.join(tmpDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  vi.mocked(claudePaths.getSessionsDir).mockReturnValue(sessionsDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeSession(
  pid: number,
  cwd: string,
  sessionId: string,
  startedAt: string,
): void {
  const content = JSON.stringify({ pid, sessionId, cwd, startedAt });
  fs.writeFileSync(path.join(sessionsDir, `${pid}.json`), content, 'utf8');
}

describe('detectSessions', () => {
  it('returns empty array when sessions directory does not exist', () => {
    vi.mocked(claudePaths.getSessionsDir).mockReturnValue('/nonexistent/path');
    const sessions = detectSessions('/some/workspace');
    expect(sessions).toEqual([]);
  });

  it('returns empty array when no session files exist', () => {
    const sessions = detectSessions('/some/workspace');
    expect(sessions).toEqual([]);
  });

  it('finds active session matching workspace', () => {
    // Use current PID so isPidRunning returns true
    const currentPid = process.pid;
    writeSession(currentPid, '/my/project', 'sess-abc', '2026-03-28T10:00:00Z');

    const sessions = detectSessions('/my/project');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].pid).toBe(currentPid);
    expect(sessions[0].sessionId).toBe('sess-abc');
  });

  it('filters out sessions with non-matching workspace', () => {
    const currentPid = process.pid;
    writeSession(currentPid, '/other/project', 'sess-abc', '2026-03-28T10:00:00Z');

    const sessions = detectSessions('/my/project');
    expect(sessions).toHaveLength(0);
  });

  it('filters out sessions with stale PID', () => {
    // Use a PID that almost certainly doesn't exist
    writeSession(999999, '/my/project', 'sess-abc', '2026-03-28T10:00:00Z');

    const sessions = detectSessions('/my/project');
    expect(sessions).toHaveLength(0);
  });

  it('returns multiple sessions sorted by recency', () => {
    const currentPid = process.pid;
    // Write two sessions with different start times
    writeSession(currentPid, '/my/project', 'sess-old', '2026-03-28T08:00:00Z');

    // For the second session, we need a different PID that is running.
    // Use PPID which is also typically a running process.
    const parentPid = process.ppid;
    writeSession(parentPid, '/my/project', 'sess-new', '2026-03-28T10:00:00Z');

    const sessions = detectSessions('/my/project');
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    // The most recent session should be first
    if (sessions.length >= 2) {
      expect(sessions[0].sessionId).toBe('sess-new');
      expect(sessions[1].sessionId).toBe('sess-old');
    }
  });

  it('handles malformed session files gracefully', () => {
    fs.writeFileSync(path.join(sessionsDir, '123.json'), 'not json', 'utf8');
    const sessions = detectSessions('/my/project');
    expect(sessions).toEqual([]);
  });

  it('normalizes trailing slashes when matching workspace', () => {
    const currentPid = process.pid;
    writeSession(currentPid, '/my/project/', 'sess-abc', '2026-03-28T10:00:00Z');

    const sessions = detectSessions('/my/project');
    expect(sessions).toHaveLength(1);
  });
});
