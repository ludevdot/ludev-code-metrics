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
 * Attempts to read the Claude Code OAuth access token.
 * Resolution order:
 *   1. macOS Keychain via `security find-generic-password`
 *   2. ~/.claude/.credentials.json (written by Claude Code CLI, all platforms)
 *   3. ~/.claude/credentials.json
 *   4. Linux secret-tool
 *   5. Windows %APPDATA%\claude\credentials.json
 *   6. Custom credentials file path from claudeUsage.credentialsPath setting
 *   7. Manual token from claudeUsage.manualToken setting
 *
 * Returns the access token string, or null if none found.
 * IMPORTANT: The token value is never logged or persisted.
 */
export function getAccessToken(): string | null {
  // 1. macOS: Keychain via security CLI
  if (process.platform === 'darwin') {
    try {
      const raw = child_process.execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
      ).trim();
      const parsed = JSON.parse(raw) as ClaudeCredentials;
      if (parsed.claudeAiOauth.accessToken) {
        return parsed.claudeAiOauth.accessToken;
      }
    } catch {
      // fall through to file-based lookup
    }
  }

  // 2. Claude Code CLI credentials file — reliable on all platforms
  const claudeCredPaths = [
    path.join(os.homedir(), '.claude', '.credentials.json'),
    path.join(os.homedir(), '.claude', 'credentials.json'),
  ];
  for (const filePath of claudeCredPaths) {
    const token = readTokenFromFile(filePath);
    if (token) {
      return token;
    }
  }

  // 3. Linux: secret-tool
  if (process.platform === 'linux') {
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
      // fall through
    }
  }

  // 5. Windows: %APPDATA%\claude\credentials.json
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? '';
    const token = readTokenFromFile(path.join(appData, 'claude', 'credentials.json'));
    if (token) {
      return token;
    }
  }

  // 6. Custom credentials file path from settings
  const credentialsPath = vscode.workspace
    .getConfiguration('claudeUsage')
    .get<string>('credentialsPath', '')
    .trim();
  if (credentialsPath) {
    const token = readTokenFromFile(credentialsPath);
    if (token) {
      return token;
    }
  }

  // 7. Manual token from settings
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

function readCredentialsFromFile(filePath: string): ClaudeCredentials | null {
  try {
    const content = fs.readFileSync(filePath, { encoding: 'utf8' });
    return JSON.parse(content) as ClaudeCredentials;
  } catch {
    return null;
  }
}

export function getSubscriptionType(): string | null {
  if (process.platform === 'darwin') {
    try {
      const raw = child_process.execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
      ).trim();
      const parsed = JSON.parse(raw) as ClaudeCredentials;
      if (parsed.claudeAiOauth.subscriptionType) {
        return parsed.claudeAiOauth.subscriptionType;
      }
    } catch {
      // fall through
    }
  }

  const claudeCredPaths = [
    path.join(os.homedir(), '.claude', '.credentials.json'),
    path.join(os.homedir(), '.claude', 'credentials.json'),
  ];
  for (const filePath of claudeCredPaths) {
    const creds = readCredentialsFromFile(filePath);
    if (creds?.claudeAiOauth.subscriptionType) {
      return creds.claudeAiOauth.subscriptionType;
    }
  }

  if (process.platform === 'linux') {
    try {
      const raw = child_process.execSync(
        'secret-tool lookup service "Claude Code-credentials"',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const parsed = JSON.parse(raw) as ClaudeCredentials;
      if (parsed.claudeAiOauth.subscriptionType) {
        return parsed.claudeAiOauth.subscriptionType;
      }
    } catch {
      // fall through
    }
  }

  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? '';
    const creds = readCredentialsFromFile(path.join(appData, 'claude', 'credentials.json'));
    if (creds?.claudeAiOauth.subscriptionType) {
      return creds.claudeAiOauth.subscriptionType;
    }
  }

  // Custom credentials file path from settings
  const credentialsPath = vscode.workspace
    .getConfiguration('claudeUsage')
    .get<string>('credentialsPath', '')
    .trim();
  if (credentialsPath) {
    const creds = readCredentialsFromFile(credentialsPath);
    if (creds?.claudeAiOauth.subscriptionType) {
      return creds.claudeAiOauth.subscriptionType;
    }
  }

  return null;
}
