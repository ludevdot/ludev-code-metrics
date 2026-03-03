import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

interface ClaudeCredentials {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType: string;
  };
}

/**
 * Attempts to read the Claude Code OAuth access token from the OS.
 * Resolution order:
 *   1. macOS Keychain (security find-generic-password)
 *   2. Linux secret-tool
 *   3. Linux/Windows filesystem fallback
 *   4. Manual token from VSCode setting claudeUsage.manualToken
 *
 * Returns the access token string, or null if none found.
 * IMPORTANT: The token value is never logged or persisted.
 */
export function getAccessToken(): string | null {
  const platform = process.platform;

  if (platform === 'darwin') {
    try {
      const raw = child_process.execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const parsed = JSON.parse(raw) as ClaudeCredentials;
      if (parsed.claudeAiOauth.accessToken) {
        return parsed.claudeAiOauth.accessToken;
      }
    } catch {
      // fall through
    }
  }

  if (platform === 'linux') {
    try {
      const raw = child_process.execSync(
        'secret-tool lookup service "Claude Code-credentials"',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const parsed = JSON.parse(raw) as ClaudeCredentials;
      if (parsed.claudeAiOauth.accessToken) {
        return parsed.claudeAiOauth.accessToken;
      }
    } catch {
      // fall through to file
    }

    const linuxPaths = [
      path.join(os.homedir(), '.claude', 'credentials.json'),
      path.join(os.homedir(), '.config', 'claude', 'credentials.json'),
    ];
    for (const filePath of linuxPaths) {
      const token = readTokenFromFile(filePath);
      if (token) {
        return token;
      }
    }
  }

  if (platform === 'win32') {
    const appData = process.env['APPDATA'] ?? '';
    const token = readTokenFromFile(path.join(appData, 'claude', 'credentials.json'));
    if (token) {
      return token;
    }
  }

  // Fallback: manual token from settings
  const manualToken = vscode.workspace
    .getConfiguration('claudeUsage')
    .get<string>('manualToken', '')
    .trim();
  if (manualToken) {
    return manualToken;
  }

  return null;
}

function readTokenFromFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, { encoding: 'utf8' });
    const parsed = JSON.parse(content) as ClaudeCredentials;
    return parsed.claudeAiOauth.accessToken ?? null;
  } catch {
    return null;
  }
}
