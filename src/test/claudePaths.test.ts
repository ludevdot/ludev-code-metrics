import { describe, it, expect, vi, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { getClaudeDir, getSessionsDir, getProjectsDir, encodeCwd, getTranscriptPath } from '../claudePaths';

// ---------------------------------------------------------------------------
// encodeCwd
// ---------------------------------------------------------------------------

describe('encodeCwd', () => {
  it('replaces all separators with dashes, keeping leading dash', () => {
    expect(encodeCwd('/Users/ludev/projects/myapp')).toBe('-Users-ludev-projects-myapp');
  });

  it('handles single-level path', () => {
    expect(encodeCwd('/tmp')).toBe('-tmp');
  });

  it('handles backslash separators (Windows-style)', () => {
    expect(encodeCwd('\\Users\\ludev\\project')).toBe('-Users-ludev-project');
  });

  it('handles path without leading separator', () => {
    expect(encodeCwd('relative/path')).toBe('relative-path');
  });
});

// ---------------------------------------------------------------------------
// getClaudeDir
// ---------------------------------------------------------------------------

describe('getClaudeDir', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    delete process.env['APPDATA'];
  });

  it('returns ~/.claude on non-Windows platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const result = getClaudeDir();
    expect(result).toBe(path.join(os.homedir(), '.claude'));
  });

  it('returns APPDATA/claude on Windows when APPDATA is set', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env['APPDATA'] = 'C:\\Users\\test\\AppData\\Roaming';
    const result = getClaudeDir();
    expect(result).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'claude'));
  });

  it('falls back to homedir on Windows when APPDATA is unset', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    delete process.env['APPDATA'];
    const result = getClaudeDir();
    expect(result).toBe(path.join(os.homedir(), 'claude'));
  });
});

// ---------------------------------------------------------------------------
// getSessionsDir / getProjectsDir
// ---------------------------------------------------------------------------

describe('getSessionsDir', () => {
  it('returns claudeDir/sessions', () => {
    const result = getSessionsDir();
    expect(result).toBe(path.join(getClaudeDir(), 'sessions'));
  });
});

describe('getProjectsDir', () => {
  it('returns claudeDir/projects', () => {
    const result = getProjectsDir();
    expect(result).toBe(path.join(getClaudeDir(), 'projects'));
  });
});

// ---------------------------------------------------------------------------
// getTranscriptPath
// ---------------------------------------------------------------------------

describe('getTranscriptPath', () => {
  it('builds correct full path from session ID and cwd', () => {
    const result = getTranscriptPath('sess-123', '/Users/ludev/myproject');
    const expected = path.join(
      getProjectsDir(),
      '-Users-ludev-myproject',
      'sess-123.jsonl',
    );
    expect(result).toBe(expected);
  });

  it('handles root-level cwd', () => {
    const result = getTranscriptPath('abc', '/tmp');
    expect(result).toBe(path.join(getProjectsDir(), '-tmp', 'abc.jsonl'));
  });
});
