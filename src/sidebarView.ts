import * as vscode from 'vscode';
import {
  getAccessTokenForAccount, getSubscriptionTypeForAccount,
  getActiveAccount, setActiveAccount, getConfiguredAccounts,
  captureCliSession, DEFAULT_ACCOUNT_LABEL,
} from './credentials';
import { fetchUsage, UsageLimits } from './usageApi';
import { formatTimeLeft } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { searchSkills, loadCache, saveCache, installSkill, fetchSkillMd, SkillResult } from './skillsManager';
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

    if (!getAccessTokenForAccount(getActiveAccount(this.context))) {
      webviewView.badge = { value: 1, tooltip: vscode.l10n.t('No credentials found') };
    }

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'ready') {
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
      if (msg.type === 'selectSkill') {
        void (async () => {
          const skill = msg.skill as SkillResult;
          const [owner, repo] = skill.source.split('/');
          try {
            const content = await fetchSkillMd(owner, repo, skill.skillId);
            this.post({ type: 'skillPreview', skill, content });
          } catch {
            this.post({ type: 'skillPreview', skill, content: '(preview unavailable)' });
          }
        })();
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
      if (msg.type === 'switchAccount') {
        void (async () => {
          await setActiveAccount(this.context, msg.label as string);
          this.lastData = null;
          this.onAccountChange?.();
          await this.refresh();
        })();
      }
      if (msg.type === 'captureSession') {
        void this.runCaptureSessionFlow();
      }
      if (msg.type === 'manageAccounts') {
        void this.runManageAccountsFlow();
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.refresh();
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
        if (e.affectsConfiguration('claudeUsage.accounts')) {
          const accounts = getConfiguredAccounts();
          const active = getActiveAccount(this.context);
          const activeRemoved = active && !accounts.find(a => a.email === active.email);
          if (activeRemoved) {
            void setActiveAccount(this.context, DEFAULT_ACCOUNT_LABEL).then(() => this.refresh());
          } else {
            void this.refresh();
          }
          const newActiveLabel = activeRemoved ? '' : (active?.email ?? '');
          const updatedOptions = accounts.map(a => ({ label: formatAccountOption(a), value: a.email }));
          this.post({ type: 'accountsUpdated', accounts: updatedOptions, activeLabel: newActiveLabel });
        }
      })
    );
  }

  async refresh(): Promise<void> {
    const account = getActiveAccount(this.context);
    const token = getAccessTokenForAccount(account);
    if (!token) {
      this.post({ type: 'noAuth' });
      this.setBadge(true);
      return;
    }
    const subType = getSubscriptionTypeForAccount(account);
    this.post({ type: 'planUpdated', planLabel: formatPlanLabel(subType) });
    try {
      const data = await fetchUsage(token);
      this.lastData = data;
      this.post({ type: 'update', data, stale: false });
      this.setBadge(false);
      this.onRefresh?.();
    } catch {
      if (this.lastData) {
        this.post({ type: 'update', data: this.lastData, stale: true });
      } else {
        this.post({ type: 'noAuth' });
        this.setBadge(true);
      }
    }
  }

  private setBadge(active: boolean): void {
    if (!this.view) { return; }
    this.view.badge = active
      ? { value: 1, tooltip: vscode.l10n.t('No credentials found') }
      : undefined;
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

  private async runManageAccountsFlow(): Promise<void> {
    const accounts = getConfiguredAccounts();
    if (accounts.length === 0) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No accounts captured yet. Use ⊕ to capture the current CLI session.'));
      return;
    }

    const picked = await vscode.window.showQuickPick(
      accounts.map(a => ({ label: formatAccountOption(a), description: '', email: a.email })),
      { title: vscode.l10n.t('Manage accounts'), placeHolder: vscode.l10n.t('Select account to delete') }
    );
    if (!picked) { return; }

    const confirmed = await vscode.window.showWarningMessage(
      vscode.l10n.t('Delete account "{0}"?', picked.email),
      { modal: true },
      vscode.l10n.t('Delete')
    );
    if (confirmed !== vscode.l10n.t('Delete')) { return; }

    const updated = accounts.filter(a => a.email !== picked.email);
    await vscode.workspace.getConfiguration('claudeUsage').update('accounts', updated, vscode.ConfigurationTarget.Global);

    const active = getActiveAccount(this.context);
    if (active?.email === picked.email) {
      await setActiveAccount(this.context, DEFAULT_ACCOUNT_LABEL);
    }
    this.lastData = null;
    this.onAccountChange?.();
    await this.refresh();
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
    const configuredAccounts = getConfiguredAccounts();
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
      skillsCancel:     vscode.l10n.t('Cancel'),
      skillsInstalled:  vscode.l10n.t('Installed'),
      skillsInstallOk:  vscode.l10n.t('Skill installed successfully'),
      skillsInstallErr: vscode.l10n.t('Error:'),
      sessionLabel:     vscode.l10n.t('Session (5h)'),
      weeklyLabel:      vscode.l10n.t('Weekly (7d)'),
      opusLabel:        vscode.l10n.t('Opus (7d)'),
      accountLabel:     vscode.l10n.t('Account'),
      accountCapture:   vscode.l10n.t('Capture current CLI session'),
      accountManage:    vscode.l10n.t('Manage accounts'),
      accountHintTitle: vscode.l10n.t('How to add another account'),
      accountHintStep1: vscode.l10n.t('1. In your terminal, log in with the other account:'),
      accountHintStep2: vscode.l10n.t('2. Come back here and click the capture button (⊕).'),
      accountHintStep3: vscode.l10n.t('3. Log back in with your main account when done.'),
    };

    // Build account selector options — email · Plan, no Default
    const hasAccounts = configuredAccounts.length > 0;
    const activeLabel = activeAccount?.email ?? DEFAULT_ACCOUNT_LABEL;
    const accountOptionsHtml = configuredAccounts
      .map(a => {
        const display = formatAccountOption(a);
        return `<option value="${this.escapeHtml(a.email)}"${a.email === activeLabel ? ' selected' : ''}>${this.escapeHtml(display)}</option>`;
      })
      .join('');
    const allAccounts = configuredAccounts.map(a => ({ label: formatAccountOption(a), value: a.email }));

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
    <button class="refresh-btn" id="refreshBtn" title="${i18n.refresh}">⟳</button>
  </div>

  <div class="account-row">
    <span class="account-row-label">${i18n.accountLabel}</span>
    <select class="account-select${hasAccounts ? '' : ' hidden'}" id="accountSelect">
      ${accountOptionsHtml}
    </select>
    <button class="account-add-btn" id="addAccountBtn" title="${i18n.accountCapture}">⊕</button>
    <button class="account-add-btn${hasAccounts ? '' : ' hidden'}" id="manageAccountsBtn" title="${i18n.accountManage}">⋯</button>
  </div>

  <details class="account-hint">
    <summary class="account-hint-summary">${i18n.accountHintTitle}</summary>
    <div class="account-hint-body">
      <p class="account-hint-substep">${i18n.accountHintStep1}</p>
      <code>claude auth login</code>
      <p class="account-hint-substep">${i18n.accountHintStep2}</p>
      <p class="account-hint-substep">${i18n.accountHintStep3}</p>
    </div>
  </details>

  <div class="tab-bar">
    <button class="tab active" data-tab="usage">${i18n.tabUsage}</button>
    <button class="tab" data-tab="skills">${i18n.skillsLabel}</button>
  </div>

  ${getUsageTabHtml(i18n, currentViewMode)}
  ${getSkillsTabHtml(i18n)}

<script nonce="${nonce}">
  const INITIAL_STYLE    = ${JSON.stringify(currentStyle)};
  const INITIAL_VIEW_MODE = ${JSON.stringify(currentViewMode)};
  const INITIAL_ACCOUNTS = ${JSON.stringify(allAccounts)};
  const I18N  = ${JSON.stringify(i18n)};
  const vscode = acquireVsCodeApi();

  // ── Tab switching ──
  (function () {
    const panels = {
      usage:  document.getElementById('tab-usage'),
      skills: document.getElementById('tab-skills'),
    };
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        Object.entries(panels).forEach(function ([k, el]) {
          el.classList.toggle('hidden', k !== btn.dataset.tab);
        });
      });
    });
  })();

  // ── Shared utils ──
  function doRefresh() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    vscode.postMessage({ type: 'refresh' });
    setTimeout(function () { btn.classList.remove('spinning'); }, 800);
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

  // ── Account selector ──
  document.getElementById('accountSelect').addEventListener('change', function () {
    vscode.postMessage({ type: 'switchAccount', label: this.value });
  });
  document.getElementById('addAccountBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'captureSession' });
  });
  document.getElementById('manageAccountsBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'manageAccounts' });
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

function formatAccountOption(account: import('./credentials').AccountConfig): string {
  const plan = formatPlanLabel(account.subscriptionType ?? null);
  return plan ? `${account.email} · ${plan}` : account.email;
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
