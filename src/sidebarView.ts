import * as vscode from 'vscode';
import {
  getAccessTokenForAccount, getSubscriptionTypeForAccount,
  getActiveAccount, setActiveAccount, getConfiguredAccounts,
  captureCliSession,
} from './credentials';
import { fetchUsage, UsageLimits } from './usageApi';
import { formatTimeLeft } from './utils';
import { addSnapshot, getHistory } from './usageHistory';
import * as fs from 'fs';
import * as path from 'path';
import { searchSkills, loadCache, saveCache, installSkill, SkillResult } from './skillsManager';
import { getSharedStyles } from './sidebar/sharedStyles';
import { getUsageTabStyles, getUsageTabHtml, getUsageTabScript } from './sidebar/usageTab';
import { getSkillsTabStyles, getSkillsTabHtml, getSkillsTabScript } from './sidebar/skillsTab';
import type { SidebarI18n } from './sidebar/types';

export class UsageSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeUsage.sidebar';

  private view?: vscode.WebviewView;
  private lastData: UsageLimits | null = null;

  /** Called after any successful data refresh so the status bar stays in sync. */
  public onRefresh?: () => void;
  /** Called when the user explicitly switches/adds an account — clears status bar cache first. */
  public onAccountChange?: () => void;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.badge = undefined;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'ready') {
        if (this.lastData) {
          const history = getHistory(this.context);
          this.post({ type: 'update', data: this.lastData, stale: true, history });
        }
        void this.refresh();
        const cached = loadCache(this.context);
        if (cached) {
          this.post({ type: 'cacheResults', skills: cached, count: cached.length });
        }
        this.post({ type: 'installedSkills', ids: this.getInstalledSkillIds() });
      }
      if (msg.type === 'refresh') {
        void this.refresh();
      }
      if (msg.type === 'changeStyle') {
        void vscode.workspace
          .getConfiguration('claudeUsage')
          .update('barStyle', msg.value, vscode.ConfigurationTarget.Global);
      }
      if (msg.type === 'changeViewMode') {
        void vscode.workspace
          .getConfiguration('claudeUsage')
          .update('viewMode', msg.value, vscode.ConfigurationTarget.Global);
      }
      if (msg.type === 'setToken') {
        void (async () => {
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
          }
        })();
      }
      if (msg.type === 'openSkillUrl') {
        void vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
      }
      if (msg.type === 'installSkill') {
        void (async () => {
          const skill = msg.skill as SkillResult;
          try {
            await installSkill(skill, this.context);
            this.post({ type: 'installSuccess', skillId: skill.skillId });
          } catch (err) {
            this.post({ type: 'installError', error: String(err) });
          }
        })();
      }
      if (msg.type === 'searchSkills') {
        void (async () => {
          try {
            const res = await searchSkills(msg.query as string);
            saveCache(this.context, res.skills);
            this.post({ type: 'searchResults', skills: res.skills, count: res.count });
          } catch {
            this.post({ type: 'searchResults', skills: [], count: 0 });
          }
        })();
      }
      if (msg.type === 'setCredentialsPath') {
        void (async () => {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: vscode.l10n.t('Select credentials file'),
            filters: { 'JSON': ['json'] },
          });
          if (uris?.[0]) {
            await vscode.workspace
              .getConfiguration('claudeUsage')
              .update('credentialsPath', uris[0].fsPath, vscode.ConfigurationTarget.Global);
          }
        })();
      }
      if (msg.type === 'captureSession') {
        void this.runCaptureSessionFlow();
      }
    });

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('claudeUsage.barStyle')) {
          const style = vscode.workspace
            .getConfiguration('claudeUsage')
            .get<string>('barStyle', 'gradient');
          this.post({ type: 'styleChanged', value: style });
        }
        if (e.affectsConfiguration('claudeUsage.viewMode')) {
          const mode = vscode.workspace
            .getConfiguration('claudeUsage')
            .get<string>('viewMode', 'extended');
          this.post({ type: 'viewModeChanged', value: mode });
        }
        if (e.affectsConfiguration('claudeUsage.manualToken')) {
          void this.refresh();
        }
        if (e.affectsConfiguration('claudeUsage.credentialsPath')) {
          void this.refresh();
        }
      })
    );
  }

  async refresh(): Promise<void> {
    const account = getActiveAccount(this.context);
    const token = getAccessTokenForAccount(account);
    if (!token) {
      this.post({ type: 'noAuth' });
      return;
    }
    const subType = getSubscriptionTypeForAccount(account);
    this.post({ type: 'planUpdated', planLabel: formatPlanLabel(subType) });
    this.post({ type: 'loading' });
    try {
      const data = await fetchUsage(token);
      this.lastData = data;
      addSnapshot(this.context, Math.round(data.five_hour.utilization), Math.round(data.seven_day.utilization));
      const history = getHistory(this.context);
      this.post({ type: 'update', data, stale: false, history });
      this.onRefresh?.();
    } catch {
      if (this.lastData) {
        this.post({ type: 'update', data: this.lastData, stale: true });
      } else {
        this.post({ type: 'noAuth' });
      }
    }
  }

  private post(msg: unknown): void {
    if (this.view?.visible) {
      void this.view.webview.postMessage(msg);
    }
  }

  private getInstalledSkillIds(): string[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { return []; }
    const lockPath = path.join(workspaceRoot, 'skills-lock.json');
    if (!fs.existsSync(lockPath)) { return []; }
    try {
      return Object.keys(JSON.parse(fs.readFileSync(lockPath, 'utf-8')));
    } catch {
      return [];
    }
  }

  private async runCaptureSessionFlow(): Promise<void> {
    const captured = captureCliSession();

    if (!captured) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t('Could not capture session. Make sure Claude Code CLI is installed and you are logged in.')
      );
      return;
    }

    const existing = getConfiguredAccounts();
    const duplicate = existing.find(a => a.email === captured.email);

    if (duplicate) {
      const overwrite = await vscode.window.showWarningMessage(
        vscode.l10n.t('Account "{0}" is already saved. Update it?', captured.email),
        { modal: true },
        vscode.l10n.t('Update')
      );
      if (overwrite !== vscode.l10n.t('Update')) { return; }
      const updated = existing.map(a => a.email === captured.email ? captured : a);
      await vscode.workspace.getConfiguration('claudeUsage').update('accounts', updated, vscode.ConfigurationTarget.Global);
    } else {
      await vscode.workspace.getConfiguration('claudeUsage').update('accounts', [...existing, captured], vscode.ConfigurationTarget.Global);
    }

    await setActiveAccount(this.context, captured.email);
    this.lastData = null;
    this.onAccountChange?.();
    await this.refresh();
    void vscode.window.showInformationMessage(vscode.l10n.t('Account "{0}" captured.', captured.email));
  }

  dispose(): void {}

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private getHtml(_webview: vscode.Webview): string {
    const nonce = Array.from(
      { length: 32 },
      () => Math.random().toString(36)[2]
    ).join('');
    const currentStyle = vscode.workspace
      .getConfiguration('claudeUsage')
      .get<string>('barStyle', 'gradient');
    const currentViewMode = vscode.workspace
      .getConfiguration('claudeUsage')
      .get<string>('viewMode', 'extended');

    const activeAccount = getActiveAccount(this.context);
    const subType   = getSubscriptionTypeForAccount(activeAccount);
    const planLabel = formatPlanLabel(subType);

    const i18n: SidebarI18n = {
      yourAccount:      vscode.l10n.t('Your account'),
      plan:             vscode.l10n.t('Plan:'),
      title:            vscode.l10n.t('Claude Code Usage'),
      refresh:          vscode.l10n.t('Refresh'),
      session:          vscode.l10n.t('Session'),
      session5h:        vscode.l10n.t('5h window'),
      weekly:           vscode.l10n.t('Weekly'),
      weekly7d:         vscode.l10n.t('7-day window'),
      stale:            vscode.l10n.t('~ stale'),
      used:             vscode.l10n.t('used'),
      noResetTime:      vscode.l10n.t('no reset time'),
      notAuth:          vscode.l10n.t('Not authenticated'),
      notAuthHint:      vscode.l10n.t('Ensure Claude Code is installed and logged in, or set {0} in settings.', 'claudeUsage.manualToken'),
      setTokenBtn:      vscode.l10n.t('Enter token manually'),
      tokenOnlyDesc:    vscode.l10n.t('Raw OAuth token. Usage data only — plan badge unavailable.'),
      setCredPathBtn:   vscode.l10n.t('Set credentials path'),
      credPathDesc:     vscode.l10n.t('Full credentials file from Claude Code CLI. Usage data and plan badge.'),
      selectCredFile:   vscode.l10n.t('Select credentials file'),
      styleLabel:       vscode.l10n.t('Status bar style'),
      gradient:         vscode.l10n.t('Gradient'),
      blocks:           vscode.l10n.t('Blocks'),
      iconOnly:         vscode.l10n.t('Icon only'),
      iconGradient:     vscode.l10n.t('Icon + bar'),
      viewModeLabel:    vscode.l10n.t('View mode'),
      compact:          vscode.l10n.t('Compact'),
      compactDesc:      vscode.l10n.t('Overview only'),
      extended:         vscode.l10n.t('Extended'),
      extendedDesc:     vscode.l10n.t('Session & Weekly'),
      updated:          vscode.l10n.t('Updated'),
      dLeft:            vscode.l10n.t('{0}d left', '{0}'),
      hLeft:            vscode.l10n.t('{0}h left', '{0}'),
      mLeft:            vscode.l10n.t('{0}m left', '{0}'),
      overview:         vscode.l10n.t('Overview'),
      tabUsage:         vscode.l10n.t('Usage'),
      skillsLabel:      vscode.l10n.t('Skills'),
      skillsSearch:     vscode.l10n.t('Search skills (min. 2 characters)'),
      skillsEmpty:      vscode.l10n.t('Type to search skills (min. 2 characters)'),
      skillsNoResults:  vscode.l10n.t('No results'),
      skillsRefine:     vscode.l10n.t('Refine your search to see more results'),
      skillsInstalls:   vscode.l10n.t('installs'),
      skillsInstall:    vscode.l10n.t('Install'),
      skillsInstalling: vscode.l10n.t('Installing...'),
      skillsViewOnSkillsSh: vscode.l10n.t('View on skills.sh'),
      skillsInstalled:  vscode.l10n.t('Installed'),
      skillsInstallOk:  vscode.l10n.t('Skill installed successfully'),
      skillsInstallErr: vscode.l10n.t('Error:'),
      sessionLabel:     vscode.l10n.t('Session (5h)'),
      weeklyLabel:      vscode.l10n.t('Weekly (7d)'),
      opusLabel:        vscode.l10n.t('Opus (7d)'),
      accountCapture:   vscode.l10n.t('Capture current CLI session'),
      refreshCooldown:  vscode.l10n.t('Please wait before refreshing again to avoid rate limits'),
    };

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    ${getSharedStyles()}
    ${getUsageTabStyles()}
    ${getSkillsTabStyles()}
  </style>
</head>
<body>

  <div class="header">
    <div style="display:flex;align-items:center;gap:6px;">
      <h2>${i18n.title}</h2>
      ${planLabel ? `<span class="plan-badge" id="planBadge">${planLabel}</span>` : '<span class="plan-badge" id="planBadge" style="display:none"></span>'}
    </div>
    <button class="refresh-btn" id="refreshBtn">↻ ${i18n.refresh}</button>
  </div>

  <div class="account-row">
    <button class="account-add-btn" id="addAccountBtn" title="${i18n.accountCapture}">⊕ ${i18n.accountCapture}</button>
  </div>

  <div class="tab-bar">
    <button class="tab active" data-tab="usage">${i18n.tabUsage}</button>
    <button class="tab" data-tab="skills">${i18n.skillsLabel}</button>
  </div>

  ${getUsageTabHtml(i18n, currentViewMode)}
  ${getSkillsTabHtml(i18n)}

<script nonce="${nonce}">
  const INITIAL_STYLE    = ${JSON.stringify(currentStyle)};
  const INITIAL_VIEW_MODE = ${JSON.stringify(currentViewMode)};
  const I18N  = ${JSON.stringify(i18n)};
  const vscode = acquireVsCodeApi();

  // ── Tab switching ──
  (function () {
    const panels = {
      usage:  document.getElementById('tab-usage'),
      skills: document.getElementById('tab-skills'),
    };

    function activateTab(tabName) {
      document.querySelectorAll('.tab').forEach(function (b) {
        b.classList.toggle('active', b.dataset.tab === tabName);
      });
      Object.entries(panels).forEach(function ([k, el]) {
        el.classList.toggle('hidden', k !== tabName);
      });
      if (tabName === 'skills' && window._skillsTabActivate) {
        window._skillsTabActivate();
      }
      vscode.setState({ tab: tabName });
    }

    // Restore last active tab
    var savedState = vscode.getState();
    if (savedState && savedState.tab && savedState.tab !== 'usage') {
      activateTab(savedState.tab);
    }

    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () { activateTab(btn.dataset.tab); });
    });
  })();

  // ── Shared utils ──
  var _lastRefresh = 0;
  var REFRESH_COOLDOWN = 30000;
  function doRefresh() {
    var now = Date.now();
    var btn = document.getElementById('refreshBtn');
    if (btn.disabled) { return; }
    _lastRefresh = now;
    btn.disabled = true;
    btn.title = I18N.refreshCooldown;
    btn.classList.add('blinking');
    vscode.postMessage({ type: 'refresh' });
    setTimeout(function () { btn.classList.remove('blinking'); }, 700);
    setTimeout(function () { btn.disabled = false; btn.title = ''; }, REFRESH_COOLDOWN);
  }
  function doSetToken()    { vscode.postMessage({ type: 'setToken' }); }
  function doSetCredPath() { vscode.postMessage({ type: 'setCredentialsPath' }); }
  function colorForPct(pct, warn) {
    if (pct >= 95)   return 'var(--vscode-statusBarItem-errorBackground, #c0392b)';
    if (pct >= warn) return 'var(--vscode-statusBarItem-warningBackground, #d68910)';
    return 'var(--vscode-charts-green, #4caf74)';
  }

  document.getElementById('refreshBtn').addEventListener('click', doRefresh);
  document.getElementById('setTokenBtn').addEventListener('click', doSetToken);
  document.getElementById('setCredPathBtn').addEventListener('click', doSetCredPath);

  // ── Account capture ──
  document.getElementById('addAccountBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'captureSession' });
  });

  ${getUsageTabScript()}
  ${getSkillsTabScript()}

  // Signal extension that webview JS is ready to receive messages
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}

function formatPlanLabel(subscriptionType: string | null): string {
  if (!subscriptionType) { return ''; }
  const map: Record<string, string> = {
    'claude_pro':        'Pro',
    'claude_free':       'Free',
    'claude_max_5x':     'Max 5×',
    'claude_max_20x':    'Max 20×',
    'claude_team':       'Team',
    'claude_enterprise': 'Enterprise',
  };
  return map[subscriptionType] ?? subscriptionType;
}
