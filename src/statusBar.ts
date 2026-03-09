import * as vscode from 'vscode';
import {
  getAccessTokenForAccount, getActiveAccount,
  DEFAULT_ACCOUNT_LABEL,
} from './credentials';
import { fetchUsage, UsageLimits } from './usageApi';
import { BarStyle, buildProgressBar, formatTimeLeft, getColorByUsage, getTextColorByUsage, getDynamicIcon } from './utils';

export class UsageStatusBar {
  private readonly sessionItem: vscode.StatusBarItem;
  private readonly weeklyItem: vscode.StatusBarItem;
  private pollingInterval: ReturnType<typeof setInterval> | undefined;
  private lastValidData: UsageLimits | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private sessionNotified = false;
  private weeklyNotified = false;

  constructor(private readonly context: vscode.ExtensionContext) {
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

  clearCache(): void {
    this.lastValidData = null;
  }

  async refresh(): Promise<void> {
    const account = getActiveAccount(this.context);
    const token = getAccessTokenForAccount(account);
    if (!token) {
      this.showNoAuth();
      return;
    }

    const accountLabel = account?.email ?? null;

    try {
      const data = await fetchUsage(token);
      this.lastValidData = data;
      this.weeklyItem.show();
      this.updateDisplay(data, false, accountLabel);
    } catch {
      if (this.lastValidData) {
        this.updateDisplay(this.lastValidData, true, accountLabel);
      } else {
        this.showNoAuth();
      }
    }
  }

  private async checkThresholdNotifications(sessionPct: number, weeklyPct: number, warningThreshold: number): Promise<void> {
    const showUsage = vscode.l10n.t('View usage');

    if (sessionPct >= warningThreshold) {
      if (!this.sessionNotified) {
        this.sessionNotified = true;
        const action = await vscode.window.showWarningMessage(
          vscode.l10n.t('Claude Code session usage is at {0}%', sessionPct),
          showUsage
        );
        if (action === showUsage) {
          void vscode.commands.executeCommand('claudeUsage.openSidebar');
        }
      }
    } else {
      this.sessionNotified = false;
    }

    if (weeklyPct >= warningThreshold) {
      if (!this.weeklyNotified) {
        this.weeklyNotified = true;
        const action = await vscode.window.showWarningMessage(
          vscode.l10n.t('Claude Code weekly usage is at {0}%', weeklyPct),
          showUsage
        );
        if (action === showUsage) {
          void vscode.commands.executeCommand('claudeUsage.openSidebar');
        }
      }
    } else {
      this.weeklyNotified = false;
    }
  }

  private updateDisplay(data: UsageLimits, stale: boolean, accountLabel: string | null): void {
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const barStyle = config.get<BarStyle>('barStyle', 'gradient');
    const warningThreshold = config.get<number>('warningThreshold', 80);
    const staleMark = stale ? ' ~' : '';

    // Session item
    const sessionPct = Math.round(data.five_hour.utilization);
    const sessionTime = formatTimeLeft(data.five_hour.resets_at);
    const sessionTimeStr = sessionTime ? ` · ${sessionTime}` : '';
    this.sessionItem.text = this.formatText(
      '$(clock)', sessionPct, vscode.l10n.t('Session'), sessionTimeStr, staleMark, barStyle, warningThreshold, accountLabel
    );
    this.sessionItem.backgroundColor = getColorByUsage(sessionPct, warningThreshold);
    this.sessionItem.color = getTextColorByUsage(sessionPct, warningThreshold);
    this.sessionItem.tooltip = this.buildTooltip(
      vscode.l10n.t('Session Usage (5h rolling window)'),
      sessionPct,
      data.five_hour.resets_at,
      accountLabel
    );

    // Weekly item
    const weeklyPct = Math.round(data.seven_day.utilization);
    const weeklyTime = formatTimeLeft(data.seven_day.resets_at);
    const weeklyTimeStr = weeklyTime ? ` · ${weeklyTime}` : '';
    this.weeklyItem.text = this.formatText(
      '$(calendar)', weeklyPct, vscode.l10n.t('Weekly'), weeklyTimeStr, staleMark, barStyle, warningThreshold, accountLabel
    );
    this.weeklyItem.backgroundColor = getColorByUsage(weeklyPct, warningThreshold);
    this.weeklyItem.color = getTextColorByUsage(weeklyPct, warningThreshold);
    this.weeklyItem.tooltip = this.buildTooltip(
      vscode.l10n.t('Weekly Usage (7-day rolling window)'),
      weeklyPct,
      data.seven_day.resets_at,
      accountLabel
    );

    void this.checkThresholdNotifications(sessionPct, weeklyPct, warningThreshold);
  }

  private formatText(
    staticIcon: string,
    pct: number,
    label: string,
    timeStr: string,
    staleMark: string,
    barStyle: BarStyle,
    warningThreshold: number,
    accountLabel: string | null
  ): string {
    const gradientBar = ` ${buildProgressBar(pct, 10, 'gradient')}`;
    const blocksBar   = ` ${buildProgressBar(pct, 10, 'blocks')}`;
    const dynIcon     = getDynamicIcon(pct, warningThreshold);
    const prefix      = accountLabel ? `[${accountLabel.slice(0, 10)}] ` : '';

    switch (barStyle) {
      case 'gradient':
        return `${prefix}${staticIcon}${gradientBar} ${label}: ${pct}%${timeStr}${staleMark}`;
      case 'blocks':
        return `${prefix}${staticIcon}${blocksBar} ${label}: ${pct}%${timeStr}${staleMark}`;
      case 'icon-only':
        return `${prefix}${dynIcon} ${label}: ${pct}%${timeStr}${staleMark}`;
      case 'icon+gradient':
        return `${prefix}${dynIcon}${gradientBar} ${label}: ${pct}%${timeStr}${staleMark}`;
    }
  }

  private buildTooltip(
    label: string,
    percent: number,
    resetsAt: string | null,
    accountLabel: string | null
  ): vscode.MarkdownString {
    const resetLine = resetsAt
      ? vscode.l10n.t('Resets at: {0}', new Date(resetsAt).toLocaleString())
      : vscode.l10n.t('No reset time available');
    const accountLine = accountLabel ? `\n\n_Account: ${accountLabel}_` : '';
    const md = new vscode.MarkdownString(
      `**Claude Code — ${label}**\n\n${vscode.l10n.t('Utilization: {0}%', percent)}\n\n${resetLine}${accountLine}\n\n_${vscode.l10n.t('Click to refresh')}_`
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
