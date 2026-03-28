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
    return vscode.l10n.t('{0}d left', diffDays);
  }
  if (diffHours >= 1) {
    return vscode.l10n.t('{0}h left', diffHours);
  }
  return vscode.l10n.t('{0}m left', diffMinutes);
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
