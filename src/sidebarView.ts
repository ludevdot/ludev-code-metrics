import * as vscode from 'vscode';
import {
  getAccessTokenForAccount, getSubscriptionTypeForAccount,
  getActiveAccount, setActiveAccount, getConfiguredAccounts,
  DEFAULT_ACCOUNT_LABEL,
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

  /**
   * Called after any successful data refresh (account switch or manual refresh),
   * so extension.ts can keep the status bar in sync.
   */
  public onRefresh?: () => void;

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
          await this.refresh();
          // onRefresh is already called inside refresh() on success
        })();
      }
      if (msg.type === 'addAccount') {
        void this.runAddAccountFlow();
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
          const activeRemoved = active && !accounts.find(a => a.label === active.label);
          if (activeRemoved) {
            void setActiveAccount(this.context, DEFAULT_ACCOUNT_LABEL).then(() => this.refresh());
          } else {
            void this.refresh();
          }
          const newActiveLabel = activeRemoved ? '' : (active?.label ?? '');
          const updatedOptions = accounts.map(a => ({ label: a.label, value: a.label }));
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
      void vscode.window.showInformationMessage(vscode.l10n.t('No accounts configured yet. Use + to add one.'));
      return;
    }

    // Pick account to manage
    const picked = await vscode.window.showQuickPick(
      accounts.map(a => ({ label: a.label, description: a.credentialsPath ?? (a.token ? vscode.l10n.t('token') : '') })),
      { title: vscode.l10n.t('Manage accounts — select an account'), placeHolder: vscode.l10n.t('Select account to edit or delete') }
    );
    if (!picked) { return; }

    const action = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t('$(edit) Rename'), value: 'rename' as const },
        { label: vscode.l10n.t('$(trash) Delete'), value: 'delete' as const },
      ],
      { title: vscode.l10n.t('Manage "{0}"', picked.label) }
    );
    if (!action) { return; }

    const current = getConfiguredAccounts();

    if (action.value === 'delete') {
      const confirmed = await vscode.window.showWarningMessage(
        vscode.l10n.t('Delete account "{0}"?', picked.label),
        { modal: true },
        vscode.l10n.t('Delete')
      );
      if (confirmed !== vscode.l10n.t('Delete')) { return; }

      const updated = current.filter(a => a.label !== picked.label);
      await vscode.workspace.getConfiguration('claudeUsage').update('accounts', updated, vscode.ConfigurationTarget.Global);

      // If active account was deleted, clear it
      const active = getActiveAccount(this.context);
      if (active?.label === picked.label) {
        await setActiveAccount(this.context, DEFAULT_ACCOUNT_LABEL);
      }
      await this.refresh();
    }

    if (action.value === 'rename') {
      const newLabel = await vscode.window.showInputBox({
        title: vscode.l10n.t('Rename "{0}"', picked.label),
        value: picked.label,
        ignoreFocusOut: true,
        validateInput: (v) => {
          if (!v.trim()) { return vscode.l10n.t('Name cannot be empty'); }
          if (v.trim() === DEFAULT_ACCOUNT_LABEL) { return vscode.l10n.t('That name is reserved'); }
          if (v.trim() !== picked.label && current.find(a => a.label === v.trim())) {
            return vscode.l10n.t('An account with that name already exists');
          }
          return null;
        },
      });
      if (!newLabel || newLabel.trim() === picked.label) { return; }

      const updated = current.map(a => a.label === picked.label ? { ...a, label: newLabel.trim() } : a);
      await vscode.workspace.getConfiguration('claudeUsage').update('accounts', updated, vscode.ConfigurationTarget.Global);

      // Update active account reference if it was renamed
      const active = getActiveAccount(this.context);
      if (active?.label === picked.label) {
        await setActiveAccount(this.context, newLabel.trim());
      }
      await this.refresh();
    }
  }

  private async runAddAccountFlow(): Promise<void> {
    // 1. Label
    const label = await vscode.window.showInputBox({
      title: vscode.l10n.t('Add account — step 1/2'),
      prompt: vscode.l10n.t('Enter a name for this account (e.g. "Work", "Personal")'),
      placeHolder: vscode.l10n.t('Account name'),
      ignoreFocusOut: true,
      validateInput: (v) => {
        if (!v.trim()) { return vscode.l10n.t('Name cannot be empty'); }
        if (v.trim() === DEFAULT_ACCOUNT_LABEL) { return vscode.l10n.t('That name is reserved'); }
        const existing = getConfiguredAccounts();
        if (existing.find(a => a.label === v.trim())) {
          return vscode.l10n.t('An account with that name already exists');
        }
        return null;
      },
    });
    if (!label) { return; }

    // 2. Credential type
    const kind = await vscode.window.showQuickPick(
      [
        {
          label: vscode.l10n.t('$(file) Credentials file'),
          description: vscode.l10n.t('Full .credentials.json — shows plan type'),
          value: 'file' as const,
        },
        {
          label: vscode.l10n.t('$(key) Token'),
          description: vscode.l10n.t('Raw OAuth token — usage data only'),
          value: 'token' as const,
        },
      ],
      {
        title: vscode.l10n.t('Add account — step 2/2'),
        placeHolder: vscode.l10n.t('How do you want to authenticate this account?'),
        ignoreFocusOut: true,
      }
    );
    if (!kind) { return; }

    let newEntry: { label: string; token?: string; credentialsPath?: string };

    if (kind.value === 'file') {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: vscode.l10n.t('Select credentials file'),
        filters: { 'JSON': ['json'] },
      });
      if (!uris?.[0]) { return; }
      newEntry = { label: label.trim(), credentialsPath: uris[0].fsPath };
    } else {
      const token = await vscode.window.showInputBox({
        title: vscode.l10n.t('Add account — enter token'),
        prompt: vscode.l10n.t('Paste your Claude Code OAuth token'),
        placeHolder: vscode.l10n.t('sk-ant-...'),
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => v.trim() ? null : vscode.l10n.t('Token cannot be empty'),
      });
      if (!token) { return; }
      newEntry = { label: label.trim(), token: token.trim() };
    }

    // Append to settings and switch to the new account
    const existing = getConfiguredAccounts();
    await vscode.workspace
      .getConfiguration('claudeUsage')
      .update('accounts', [...existing, newEntry], vscode.ConfigurationTarget.Global);
    await setActiveAccount(this.context, newEntry.label);
    await this.refresh();
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
    const activeLabel = activeAccount?.label ?? DEFAULT_ACCOUNT_LABEL;
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
      accountLabel:      vscode.l10n.t('Account'),
      accountAdd:        vscode.l10n.t('Add account'),
      accountManage:     vscode.l10n.t('Manage accounts'),
      accountHintTitle:      vscode.l10n.t('How to add another account'),
      accountHintMacIntro:   vscode.l10n.t('On macOS, tokens live in the Keychain. You need to extract each token while that account is active. Do this before switching:'),
      accountHintMacCmd:     vscode.l10n.t('Run in terminal to get the active token:'),
      accountHintMacStep1:   vscode.l10n.t('1. While logged in as account B, run the command and copy the output.'),
      accountHintMacStep2:   vscode.l10n.t('2. Click + → Token → paste it → name it (e.g. "Work").'),
      accountHintMacStep3:   vscode.l10n.t('3. Log back in as your main account (claude auth login).'),
      accountHintMacStep4:   vscode.l10n.t('4. "Default" will resume pointing to your main account.'),
      accountHintMacWarning: vscode.l10n.t('⚠ Token-only accounts do not show plan type.'),
      accountHintFile1:      vscode.l10n.t('On Linux/Windows, copy the credentials file while logged in as the other account:'),
      accountHintFile2:      vscode.l10n.t('Then click + → Credentials file and select the copied file.'),
    };

    // Build account selector options — no Default, only configured accounts
    const hasAccounts = configuredAccounts.length > 0;
    const accountOptionsHtml = configuredAccounts
      .map(a => `<option value="${this.escapeHtml(a.label)}"${a.label === activeLabel ? ' selected' : ''}>${this.escapeHtml(a.label)}</option>`)
      .join('');
    // For the JS constant we still pass the list (used by accountsUpdated handler)
    const allAccounts = configuredAccounts.map(a => ({ label: a.label, value: a.label }));

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
    <button class="account-add-btn" id="addAccountBtn" title="${i18n.accountAdd}">+</button>
    <button class="account-add-btn${hasAccounts ? '' : ' hidden'}" id="manageAccountsBtn" title="${i18n.accountManage}">⋯</button>
  </div>

  <details class="account-hint">
    <summary class="account-hint-summary">${i18n.accountHintTitle}</summary>
    <div class="account-hint-body">
      ${process.platform === 'darwin' ? `
      <p>${i18n.accountHintMacIntro}</p>
      <p class="account-hint-substep">${i18n.accountHintMacStep1}</p>
      <p class="account-hint-sublabel">${i18n.accountHintMacCmd}</p>
      <code>security find-generic-password -s "Claude Code-credentials" -w | python3 -c "import sys,json; print(json.load(sys.stdin)['claudeAiOauth']['accessToken'])"</code>
      <p class="account-hint-substep">${i18n.accountHintMacStep2}</p>
      <p class="account-hint-substep">${i18n.accountHintMacStep3}</p>
      <p class="account-hint-substep">${i18n.accountHintMacStep4}</p>
      <p class="account-hint-tip">${i18n.accountHintMacWarning}</p>
      ` : `
      <p>${i18n.accountHintFile1}</p>
      <code>~/.claude/.credentials.json</code>
      <p>${i18n.accountHintFile2}</p>
      `}
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
    vscode.postMessage({ type: 'addAccount' });
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
