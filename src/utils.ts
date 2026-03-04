import * as vscode from 'vscode';

export type BarStyle = 'gradient' | 'blocks' | 'icon-only' | 'icon+gradient';

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
 * Builds a progress bar of the given length.
 * gradient: ▰▰▰▰▰▱▱▱▱▱
 * blocks:   █████░░░░░
 */
export function buildProgressBar(
  percent: number,
  length = 10,
  style: 'gradient' | 'blocks' = 'gradient'
): string {
  const filled = Math.max(0, Math.min(length, Math.round((percent / 100) * length)));
  if (style === 'blocks') {
    return '█'.repeat(filled) + '░'.repeat(length - filled);
  }
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

/**
 * Returns a dynamic codicon based on usage level.
 * $(pass) → $(warning) → $(error) as utilization rises.
 */
export function getDynamicIcon(percent: number, warningThreshold: number): string {
  if (percent >= 95) {
    return '$(error)';
  }
  if (percent >= warningThreshold) {
    return '$(warning)';
  }
  return '$(pass)';
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
