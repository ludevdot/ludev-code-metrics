import * as vscode from 'vscode';
import { getAccessToken } from './credentials';
import { fetchUsage, UsageLimits } from './usageApi';
import { BarStyle, buildProgressBar, formatTimeLeft, getColorByUsage, getDynamicIcon } from './utils';

export class UsageStatusBar {
  private readonly sessionItem: vscode.StatusBarItem;
  private readonly weeklyItem: vscode.StatusBarItem;
  private pollingInterval: ReturnType<typeof setInterval> | undefined;
  private lastValidData: UsageLimits | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.sessionItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.sessionItem.command = 'claudeUsage.refresh';

    this.weeklyItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.weeklyItem.command = 'claudeUsage.refresh';

    this.sessionItem.show();
    this.weeklyItem.show();

    this.disposables.push(
      vscode.commands.registerCommand('claudeUsage.refresh', () => {
        void this.refresh();
      }),
      vscode.commands.registerCommand('claudeUsage.setCredentialsPath', async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: vscode.l10n.t('Select credentials file'),
          filters: { 'JSON': ['json'] },
        });
        if (uris?.[0]) {
          await vscode.workspace
            .getConfiguration('claudeUsage')
            .update('credentialsPath', uris[0].fsPath, vscode.ConfigurationTarget.Global);
          void this.refresh();
        }
      }),
      vscode.commands.registerCommand('claudeUsage.setToken', async () => {
        const token = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Enter your Claude Code OAuth token'),
          placeHolder: vscode.l10n.t('Paste your token here...'),
          password: true,
          ignoreFocusOut: true,
        });
        if (token !== undefined) {
          await vscode.workspace
            .getConfiguration('claudeUsage')
            .update('manualToken', token.trim(), vscode.ConfigurationTarget.Global);
          void this.refresh();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('claudeUsage')) {
          this.restartPolling();
        }
      })
    );

    context.subscriptions.push(...this.disposables);
  }

  async start(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      this.showNoAuth();
      return;
    }

    try {
      const data = await fetchUsage(token);
      this.lastValidData = data;
      this.weeklyItem.show();
      this.updateDisplay(data, false);
    } catch {
      if (this.lastValidData) {
        this.updateDisplay(this.lastValidData, true);
      } else {
        this.showNoAuth();
      }
    }
  }

  private updateDisplay(data: UsageLimits, stale: boolean): void {
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const barStyle = config.get<BarStyle>('barStyle', 'gradient');
    const warningThreshold = config.get<number>('warningThreshold', 80);
    const staleMark = stale ? ' ~' : '';

    // Session item
    const sessionPct = Math.round(data.five_hour.utilization);
    const sessionTime = formatTimeLeft(data.five_hour.resets_at);
    const sessionTimeStr = sessionTime ? ` · ${sessionTime}` : '';
    this.sessionItem.text = this.formatText(
      '$(clock)', sessionPct, vscode.l10n.t('Session'), sessionTimeStr, staleMark, barStyle, warningThreshold
    );
    this.sessionItem.backgroundColor = getColorByUsage(sessionPct, warningThreshold);
    this.sessionItem.tooltip = this.buildTooltip(
      vscode.l10n.t('Session Usage (5h rolling window)'),
      sessionPct,
      data.five_hour.resets_at
    );

    // Weekly item
    const weeklyPct = Math.round(data.seven_day.utilization);
    const weeklyTime = formatTimeLeft(data.seven_day.resets_at);
    const weeklyTimeStr = weeklyTime ? ` · ${weeklyTime}` : '';
    this.weeklyItem.text = this.formatText(
      '$(calendar)', weeklyPct, vscode.l10n.t('Weekly'), weeklyTimeStr, staleMark, barStyle, warningThreshold
    );
    this.weeklyItem.backgroundColor = getColorByUsage(weeklyPct, warningThreshold);
    this.weeklyItem.tooltip = this.buildTooltip(
      vscode.l10n.t('Weekly Usage (7-day rolling window)'),
      weeklyPct,
      data.seven_day.resets_at
    );
  }

  private formatText(
    staticIcon: string,
    pct: number,
    label: string,
    timeStr: string,
    staleMark: string,
    barStyle: BarStyle,
    warningThreshold: number
  ): string {
    const gradientBar = ` ${buildProgressBar(pct, 10, 'gradient')}`;
    const blocksBar   = ` ${buildProgressBar(pct, 10, 'blocks')}`;
    const dynIcon     = getDynamicIcon(pct, warningThreshold);

    switch (barStyle) {
      case 'gradient':
        return `${staticIcon}${gradientBar} ${label}: ${pct}%${timeStr}${staleMark}`;
      case 'blocks':
        return `${staticIcon}${blocksBar} ${label}: ${pct}%${timeStr}${staleMark}`;
      case 'icon-only':
        return `${dynIcon} ${label}: ${pct}%${timeStr}${staleMark}`;
      case 'icon+gradient':
        return `${dynIcon}${gradientBar} ${label}: ${pct}%${timeStr}${staleMark}`;
    }
  }

  private buildTooltip(
    label: string,
    percent: number,
    resetsAt: string | null
  ): vscode.MarkdownString {
    const resetLine = resetsAt
      ? vscode.l10n.t('Resets at: {0}', new Date(resetsAt).toLocaleString())
      : vscode.l10n.t('No reset time available');
    const md = new vscode.MarkdownString(
      `**Claude Code — ${label}**\n\n${vscode.l10n.t('Utilization: {0}%', percent)}\n\n${resetLine}\n\n_${vscode.l10n.t('Click to refresh')}_`
    );
    md.isTrusted = true;
    return md;
  }

  private showNoAuth(): void {
    const errorBg = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.sessionItem.text = `$(error) Claude: ${vscode.l10n.t('No auth')}`;
    this.sessionItem.backgroundColor = errorBg;
    this.sessionItem.tooltip = vscode.l10n.t(
      'Claude Code credentials not found.\nSet claudeUsage.manualToken in settings, or ensure Claude Code is installed and logged in.'
    );
    this.weeklyItem.hide();
  }

  private restartPolling(): void {
    void this.refresh();
  }

  dispose(): void {
    if (this.pollingInterval !== undefined) {
      clearInterval(this.pollingInterval);
    }
    this.sessionItem.dispose();
    this.weeklyItem.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
