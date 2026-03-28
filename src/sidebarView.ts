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
import { detectSessions } from './sessionDetector';
import { parseTranscript } from './transcriptParser';
import { calculateCostByModel } from './costCalculator';
import type { SidebarI18n, SessionInfo, CostRates } from './sidebar/types';
import type { UsageStatusBar } from './statusBar';

export class UsageSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ludevMetrics.sidebar';

  private view?: vscode.WebviewView;
  private lastData: UsageLimits | null = null;
  private autoRefreshTimer: ReturnType<typeof setInterval> | undefined;
  private transcriptWatcher: fs.FSWatcher | undefined;
  private transcriptDebounce: ReturnType<typeof setTimeout> | undefined;
  private activeSessions: SessionInfo[] = [];
  private selectedSessionIndex = 0;

  /** Called after any successful data refresh so the status bar stays in sync. */
  public onRefresh?: () => void;
  /** Called when the user explicitly switches/adds an account — clears status bar cache first. */
  public onAccountChange?: () => void;
  /** Reference to status bar for updating context display. */
  public statusBar?: UsageStatusBar;

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
        } else {
          this.post({ type: 'noAuth' });
        }
        const cached = loadCache(this.context);
        if (cached) {
          this.post({ type: 'cacheResults', skills: cached, count: cached.length });
        }
        this.post({ type: 'installedSkills', ids: this.getInstalledSkillIds() });
        const arConfig = vscode.workspace.getConfiguration('ludevMetrics');
        const arEnabled = arConfig.get<boolean>('autoRefresh', false);
        const arMinutes = arConfig.get<number>('autoRefreshInterval', 5);
        this.post({ type: 'autoRefreshChanged', enabled: arEnabled, minutes: arMinutes });
        this.updateAutoRefreshTimer(arEnabled, arMinutes);
        void this.refreshContext();
      }
      if (msg.type === 'refresh') {
        void this.refresh();
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
              .getConfiguration('ludevMetrics')
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
              .getConfiguration('ludevMetrics')
              .update('credentialsPath', uris[0].fsPath, vscode.ConfigurationTarget.Global);
          }
        })();
      }
      if (msg.type === 'toggleAutoRefresh') {
        const config = vscode.workspace.getConfiguration('ludevMetrics');
        const enabled = msg.enabled as boolean;
        const minutes = msg.minutes as number;
        void config.update('autoRefresh', enabled, vscode.ConfigurationTarget.Global);
        void config.update('autoRefreshInterval', minutes, vscode.ConfigurationTarget.Global);
        this.updateAutoRefreshTimer(enabled, minutes);
      }
      if (msg.type === 'captureSession') {
        void this.runCaptureSessionFlow();
      }
      if (msg.type === 'contextSelectSession') {
        this.selectedSessionIndex = msg.index as number;
        void this.refreshContext();
      }
    });

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('ludevMetrics.manualToken')) {
          void this.refresh();
        }
        if (e.affectsConfiguration('ludevMetrics.credentialsPath')) {
          void this.refresh();
        }
        if (e.affectsConfiguration('ludevMetrics.autoRefresh') || e.affectsConfiguration('ludevMetrics.autoRefreshInterval')) {
          const arCfg = vscode.workspace.getConfiguration('ludevMetrics');
          const arOn = arCfg.get<boolean>('autoRefresh', false);
          const arMin = arCfg.get<number>('autoRefreshInterval', 5);
          this.post({ type: 'autoRefreshChanged', enabled: arOn, minutes: arMin });
          this.updateAutoRefreshTimer(arOn, arMin);
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

  /** Update sidebar display with data fetched externally (e.g. from status bar). Does not trigger onRefresh. */
  updateData(data: UsageLimits): void {
    this.lastData = data;
    if (this.view?.visible) {
      const history = getHistory(this.context);
      this.post({ type: 'update', data, stale: false, history });
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
      await vscode.workspace.getConfiguration('ludevMetrics').update('accounts', updated, vscode.ConfigurationTarget.Global);
    } else {
      await vscode.workspace.getConfiguration('ludevMetrics').update('accounts', [...existing, captured], vscode.ConfigurationTarget.Global);
    }

    await setActiveAccount(this.context, captured.email);
    this.lastData = null;
    this.onAccountChange?.();
    await this.refresh();
    void vscode.window.showInformationMessage(vscode.l10n.t('Account "{0}" captured.', captured.email));
  }

  /** Detects active sessions and parses the transcript for the selected session. */
  async refreshContext(): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      this.post({ type: 'contextError' });
      this.statusBar?.hideContextDisplay();
      return;
    }

    this.activeSessions = detectSessions(workspacePath);
    if (this.activeSessions.length === 0) {
      this.post({ type: 'contextUpdate', metrics: null, cost: null, models: [], sessions: [] });
      this.statusBar?.hideContextDisplay();
      this.stopTranscriptWatcher();
      return;
    }

    // Clamp index
    if (this.selectedSessionIndex >= this.activeSessions.length) {
      this.selectedSessionIndex = 0;
    }
    const session = this.activeSessions[this.selectedSessionIndex];

    try {
      const result = await parseTranscript(session.transcriptPath);
      const customRates = vscode.workspace
        .getConfiguration('ludevMetrics')
        .get<CostRates>('costRates', {
          inputPerMtok: 3.00,
          outputPerMtok: 15.00,
          cacheReadPerMtok: 0.30,
          cacheCreationPerMtok: 3.75,
        });
      const cost = calculateCostByModel(result.modelTokens, customRates);
      const models = Object.keys(result.modelTokens).filter(m => m !== 'unknown');

      const payload = {
        type: 'contextUpdate' as const,
        metrics: result.metrics,
        cost,
        models,
        sessions: this.activeSessions.map(s => ({ pid: s.pid, startedAt: s.startedAt })),
        selectedIndex: this.selectedSessionIndex,
      };
      this.post(payload);

      const totalTokens = result.metrics.inputTokens + result.metrics.outputTokens
        + result.metrics.cacheReadTokens + result.metrics.cacheCreationTokens;
      this.statusBar?.updateContextDisplay(cost.totalCost, totalTokens);

      // Start watching the transcript file
      this.startTranscriptWatcher(session.transcriptPath);
    } catch {
      this.post({ type: 'contextError' });
      this.statusBar?.hideContextDisplay();
    }
  }

  private startTranscriptWatcher(filePath: string): void {
    this.stopTranscriptWatcher();
    try {
      this.transcriptWatcher = fs.watch(filePath, () => {
        if (this.transcriptDebounce) { clearTimeout(this.transcriptDebounce); }
        this.transcriptDebounce = setTimeout(() => {
          void this.refreshContext();
        }, 2000);
      });
    } catch {
      // File may not exist yet — that's fine
    }
  }

  private stopTranscriptWatcher(): void {
    if (this.transcriptDebounce) {
      clearTimeout(this.transcriptDebounce);
      this.transcriptDebounce = undefined;
    }
    if (this.transcriptWatcher) {
      this.transcriptWatcher.close();
      this.transcriptWatcher = undefined;
    }
  }

  private updateAutoRefreshTimer(enabled: boolean, minutes: number): void {
    if (this.autoRefreshTimer !== undefined) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }
    if (enabled && minutes >= 1) {
      this.autoRefreshTimer = setInterval(() => {
        void this.refresh();
      }, minutes * 60 * 1000);
    }
  }

  dispose(): void {
    if (this.autoRefreshTimer !== undefined) {
      clearInterval(this.autoRefreshTimer);
    }
    this.stopTranscriptWatcher();
  }

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

    const activeAccount = getActiveAccount(this.context);
    const subType   = getSubscriptionTypeForAccount(activeAccount);
    const planLabel = formatPlanLabel(subType);

    const i18n: SidebarI18n = {
      yourAccount:      vscode.l10n.t('Your account'),
      plan:             vscode.l10n.t('Plan:'),
      title: vscode.l10n.t('Ludev Code Metrics'),
      refresh:          vscode.l10n.t('Refresh'),
      session:          vscode.l10n.t('Session'),
      session5h:        vscode.l10n.t('5h window'),
      weekly:           vscode.l10n.t('Weekly'),
      weekly7d:         vscode.l10n.t('7-day window'),
      stale:            vscode.l10n.t('~ stale'),
      used:             vscode.l10n.t('used'),
      noResetTime:      vscode.l10n.t('no reset time'),
      notAuth:          vscode.l10n.t('Not authenticated'),
      notAuthHint:      vscode.l10n.t('Run {0} in your terminal, then click "Capture current CLI session" above.', 'claude auth login'),
      setTokenBtn:      vscode.l10n.t('Enter token manually'),
      tokenOnlyDesc:    vscode.l10n.t('Raw OAuth token. Usage data only — plan badge unavailable.'),
      setCredPathBtn:   vscode.l10n.t('Set credentials path'),
      credPathDesc:     vscode.l10n.t('Full credentials file from Claude Code CLI. Usage data and plan badge.'),
      selectCredFile:   vscode.l10n.t('Select credentials file'),
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
      autoRefreshLabel: vscode.l10n.t('Auto-refresh'),
      autoRefreshEnable: vscode.l10n.t('Enable auto-refresh'),
      autoRefreshEvery: vscode.l10n.t('Refresh every'),
      autoRefreshMinutes: vscode.l10n.t('minutes'),
      autoRefreshHint: vscode.l10n.t('Frequent auto-refresh may cause Claude to temporarily block usage requests. We recommend refreshing every 5 minutes, or manually via the refresh button or status bar click.'),
      // Context tab
      ctxLabel:          vscode.l10n.t('Context'),
      ctxNoSession:      vscode.l10n.t('No active Claude Code session detected for this workspace.'),
      ctxSessionLabel:   vscode.l10n.t('Active session'),
      ctxTokenBreakdown: vscode.l10n.t('Token breakdown'),
      ctxInput:          vscode.l10n.t('Input'),
      ctxOutput:         vscode.l10n.t('Output'),
      ctxCacheRead:      vscode.l10n.t('Cache read'),
      ctxCacheWrite:     vscode.l10n.t('Cache write'),
      ctxSummary:        vscode.l10n.t('Summary'),
      ctxCostLabel:      vscode.l10n.t('Est. cost'),
      ctxResponses:      vscode.l10n.t('Responses'),
      ctxDuration:       vscode.l10n.t('Duration'),
      ctxTotalTokens:    vscode.l10n.t('Total tokens'),
      ctxModels:         vscode.l10n.t('Models'),
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
      <label class="auto-refresh-toggle" style="margin:0;">
        <span class="toggle-switch">
          <input type="checkbox" id="autoRefreshToggle">
          <span class="toggle-track"></span>
        </span>
        <span class="auto-refresh-toggle-label">${i18n.autoRefreshLabel}</span>
      </label>
      ${planLabel ? `<span class="plan-badge" id="planBadge">${planLabel}</span>` : '<span class="plan-badge" id="planBadge" style="display:none"></span>'}
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <div id="autoRefreshInput" style="display:none;">
        <div class="auto-refresh-interval" style="padding:0;">
          <label>${i18n.autoRefreshEvery}</label>
          <input type="number" id="autoRefreshMinutes" min="1" max="60" value="5">
          <span>${i18n.autoRefreshMinutes}</span>
        </div>
      </div>
      <button class="refresh-btn" id="refreshBtn">↻ ${i18n.refresh}</button>
    </div>
  </div>
  <div class="auto-refresh-hint" id="autoRefreshHint" style="display:none;">${i18n.autoRefreshHint}</div>

  <div class="account-row">
    <button class="account-add-btn" id="addAccountBtn" title="${i18n.accountCapture}">⊕ ${i18n.accountCapture}</button>
  </div>

  <div class="tab-bar">
    <button class="tab active" data-tab="usage">${i18n.tabUsage}</button>
    <button class="tab" data-tab="skills">${i18n.skillsLabel}</button>
  </div>

  ${getUsageTabHtml(i18n)}
  ${getSkillsTabHtml(i18n)}

<script nonce="${nonce}">
  const I18N  = ${JSON.stringify(i18n)};
  const vscode = acquireVsCodeApi();

  // ── Tab switching ──
  (function () {
    const panels = {
      usage:   document.getElementById('tab-usage'),
      skills:  document.getElementById('tab-skills'),
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

    // Restore last active tab (ignore legacy 'context' tab)
    var savedState = vscode.getState();
    if (savedState && savedState.tab && savedState.tab !== 'usage' && savedState.tab !== 'context') {
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

  // ── Auto-refresh toggle ──
  (function () {
    var toggle = document.getElementById('autoRefreshToggle');
    var inputWrap = document.getElementById('autoRefreshInput');
    var minutesInput = document.getElementById('autoRefreshMinutes');
    var refreshBtn = document.getElementById('refreshBtn');
    var hint = document.getElementById('autoRefreshHint');

    window._applyAutoRefreshState = function (enabled, minutes) {
      toggle.checked = enabled;
      minutesInput.value = String(minutes);
      inputWrap.style.display = enabled ? '' : 'none';
      refreshBtn.style.display = enabled ? 'none' : '';
      hint.style.display = enabled ? '' : 'none';
    };

    toggle.addEventListener('change', function () {
      var mins = parseInt(minutesInput.value, 10) || 5;
      window._applyAutoRefreshState(toggle.checked, mins);
      vscode.postMessage({
        type: 'toggleAutoRefresh',
        enabled: toggle.checked,
        minutes: mins
      });
    });

    minutesInput.addEventListener('change', function () {
      var val = parseInt(minutesInput.value, 10);
      if (val < 1) { val = 1; minutesInput.value = '1'; }
      if (val > 60) { val = 60; minutesInput.value = '60'; }
      if (toggle.checked) {
        vscode.postMessage({
          type: 'toggleAutoRefresh',
          enabled: true,
          minutes: val
        });
      }
    });
  })();

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
