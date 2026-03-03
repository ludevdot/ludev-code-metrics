import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

vi.mock('fs');
vi.mock('child_process');

// vi.mock() calls are hoisted by Vitest before imports, so this static import
// already sees the mocked fs and child_process modules.
import { getAccessToken } from '../credentials';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIMARY_PATH   = path.join(os.homedir(), '.claude', '.credentials.json');
const SECONDARY_PATH = path.join(os.homedir(), '.claude', 'credentials.json');

function makeCredJson(accessToken: string): string {
  return JSON.stringify({ claudeAiOauth: { accessToken } });
}

/** Make fs.readFileSync return validJson for the given path, throw for others. */
function fsReturnsFor(targetPath: string, content: string) {
  vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
    if (filePath === targetPath) return content;
    throw new Error('ENOENT');
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all file reads fail and manual token is empty.
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(''),
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  });

  // ── File resolution ──────────────────────────────────────────────────────

  it('returns the token from the primary credentials path', () => {
    fsReturnsFor(PRIMARY_PATH, makeCredJson('primary-token'));
    expect(getAccessToken()).toBe('primary-token');
  });

  it('falls through to the secondary path when the primary is missing', () => {
    fsReturnsFor(SECONDARY_PATH, makeCredJson('secondary-token'));
    expect(getAccessToken()).toBe('secondary-token');
  });

  it('returns null when both credential files have invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not-json');
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(''),
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
    expect(getAccessToken()).toBeNull();
  });

  it('returns null when credential files are missing accessToken field', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ claudeAiOauth: {} }));
    expect(getAccessToken()).toBeNull();
  });

  // ── Linux secret-tool ────────────────────────────────────────────────────

  it('falls through to secret-tool on linux when files are missing', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const secretData = makeCredJson('linux-token');
    // execSync with { encoding: 'utf8' } returns a string; cast to satisfy overloads.
    vi.mocked(child_process.execSync).mockImplementation(() => secretData as string);

    const token = getAccessToken();

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    expect(token).toBe('linux-token');
  });

  it('continues past secret-tool failures on linux', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    vi.mocked(child_process.execSync).mockImplementation(() => { throw new Error('not found'); });

    const token = getAccessToken();

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    expect(token).toBeNull();
  });

  // ── Manual token fallback ────────────────────────────────────────────────

  it('returns the manual token from settings when all other sources fail', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockImplementation((key: string) =>
        key === 'manualToken' ? '  my-manual-token  ' : ''
      ),
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    expect(getAccessToken()).toBe('my-manual-token');
  });

  it('returns null when no source provides a token', () => {
    expect(getAccessToken()).toBeNull();
  });
});
