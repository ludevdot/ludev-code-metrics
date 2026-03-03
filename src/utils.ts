import * as vscode from 'vscode';

/**
 * Formats the time remaining until a reset timestamp.
 * Returns an empty string if resetsAt is null or in the past.
 * Examples: "3h left", "2d left", "45m left"
 */
export function formatTimeLeft(resetsAt: string | null): string {
  if (!resetsAt) {
    return '';
  }

  const diffMs = new Date(resetsAt).getTime() - Date.now();
  if (diffMs <= 0) {
    return '';
  }

  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 1) {
    return `${diffDays}d left`;
  }
  if (diffHours >= 1) {
    return `${diffHours}h left`;
  }
  return `${diffMinutes}m left`;
}

/**
 * Builds an ASCII progress bar of the given length.
 * Example: buildProgressBar(26, 10) => "███░░░░░░░"
 */
export function buildProgressBar(percent: number, length = 10): string {
  const filled = Math.max(0, Math.min(length, Math.round((percent / 100) * length)));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/**
 * Returns the appropriate StatusBarItem backgroundColor based on utilization.
 * - >= 95%: errorBackground
 * - >= warningThreshold%: warningBackground
 * - else: undefined (default)
 */
export function getColorByUsage(
  percent: number,
  warningThreshold: number
): vscode.ThemeColor | undefined {
  if (percent >= 95) {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (percent >= warningThreshold) {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  return undefined;
}
