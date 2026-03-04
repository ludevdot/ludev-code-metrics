import * as vscode from 'vscode';
import { getAccessToken, getSubscriptionType } from './credentials';
import { fetchUsage, UsageLimits } from './usageApi';
import { formatTimeLeft } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { searchSkills, loadCache, saveCache, installSkill, fetchSkillMd, SkillResult } from './skillsManager';

export class UsageSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeUsage.sidebar';

  private view?: vscode.WebviewView;
  private lastData: UsageLimits | null = null;


  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    if (!getAccessToken()) {
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
      })
    );
  }

  async refresh(): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      this.post({ type: 'noAuth' });
      this.setBadge(true);
      return;
    }
    try {
      const data = await fetchUsage(token);
      this.lastData = data;
      this.post({ type: 'update', data, stale: false });
      this.setBadge(false);
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

  dispose(): void {}

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

    const subType = getSubscriptionType();
    const planLabel = formatPlanLabel(subType);

    const i18n = {
      yourAccount:    vscode.l10n.t('Your account'),
      plan:           vscode.l10n.t('Plan:'),
      title:          vscode.l10n.t('Claude Code Usage'),
      refresh:        vscode.l10n.t('Refresh'),
      session:        vscode.l10n.t('Session'),
      session5h:      vscode.l10n.t('5h window'),
      weekly:         vscode.l10n.t('Weekly'),
      weekly7d:       vscode.l10n.t('7-day window'),
      stale:          vscode.l10n.t('~ stale'),
      used:           vscode.l10n.t('used'),
      noResetTime:    vscode.l10n.t('no reset time'),
      notAuth:        vscode.l10n.t('Not authenticated'),
      notAuthHint:    vscode.l10n.t('Ensure Claude Code is installed and logged in, or set {0} in settings.', 'claudeUsage.manualToken'),
      setTokenBtn:    vscode.l10n.t('Enter token manually'),
      tokenOnlyDesc:  vscode.l10n.t('Raw OAuth token. Usage data only — plan badge unavailable.'),
      setCredPathBtn: vscode.l10n.t('Set credentials path'),
      credPathDesc:   vscode.l10n.t('Full credentials file from Claude Code CLI. Usage data and plan badge.'),
      selectCredFile: vscode.l10n.t('Select credentials file'),
      styleLabel:     vscode.l10n.t('Status bar style'),
      gradient:       vscode.l10n.t('Gradient'),
      blocks:         vscode.l10n.t('Blocks'),
      iconOnly:       vscode.l10n.t('Icon only'),
      iconGradient:   vscode.l10n.t('Icon + bar'),
      viewModeLabel:  vscode.l10n.t('View mode'),
      compact:        vscode.l10n.t('Compact'),
      compactDesc:    vscode.l10n.t('Overview only'),
      extended:       vscode.l10n.t('Extended'),
      extendedDesc:   vscode.l10n.t('Session & Weekly'),
      updated:        vscode.l10n.t('Updated'),
      dLeft:          vscode.l10n.t('{0}d left', '{0}'),
      hLeft:          vscode.l10n.t('{0}h left', '{0}'),
      mLeft:          vscode.l10n.t('{0}m left', '{0}'),
      overview:       vscode.l10n.t('Overview'),
      tabUsage:       vscode.l10n.t('Usage'),
      skillsLabel:    vscode.l10n.t('Skills'),
      skillsSearch:   vscode.l10n.t('Search skills (min. 2 characters)'),
      skillsEmpty:    vscode.l10n.t('Type to search skills (min. 2 characters)'),
      skillsNoResults:vscode.l10n.t('No results'),
      skillsRefine:   vscode.l10n.t('Refine your search to see more results'),
      skillsInstalls: vscode.l10n.t('installs'),
      skillsInstall:  vscode.l10n.t('Install'),
      skillsInstalling: vscode.l10n.t('Installing...'),
      skillsCancel:   vscode.l10n.t('Cancel'),
      skillsInstalled: vscode.l10n.t('Installed'),
      skillsInstallOk: vscode.l10n.t('Skill installed successfully'),
      skillsInstallErr: vscode.l10n.t('Error:'),
      sessionLabel:   vscode.l10n.t('Session (5h)'),
      weeklyLabel:    vscode.l10n.t('Weekly (7d)'),
      opusLabel:      vscode.l10n.t('Opus (7d)'),
    };

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .header h2 {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
      opacity: 0.7;
    }
    .refresh-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--vscode-foreground);
      opacity: 0.6;
      font-size: 16px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      transition: opacity 0.15s, background 0.15s;
    }
    .refresh-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
    .refresh-btn.spinning { animation: spin 0.7s linear infinite; }

    /* ── Cards ── */
    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      border-radius: 8px;
      padding: 14px 14px 12px;
      margin-bottom: 10px;
      transition: border-color 0.2s;
    }
    .card.warn  { border-color: var(--vscode-statusBarItem-warningBackground, #c87320); }
    .card.error { border-color: var(--vscode-statusBarItem-errorBackground,   #c72020); }

    .card-header {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 600;
    }
    .card-sub {
      font-size: 10px;
      opacity: 0.5;
    }

    /* ── Circular progress ── */
    .card-body {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .ring-wrap { flex-shrink: 0; position: relative; width: 72px; height: 72px; }
    .ring-wrap svg { width: 72px; height: 72px; }

    .ring-track {
      stroke: var(--vscode-widget-border, rgba(128,128,128,0.25));
    }
    .ring-fill {
      stroke-linecap: round;
      transition: stroke-dasharray 0.5s ease, stroke 0.3s ease;
    }
    .ring-pct {
      font-size: 9px;
      font-weight: 700;
      fill: var(--vscode-foreground);
      dominant-baseline: middle;
      text-anchor: middle;
    }
    .ring-label {
      font-size: 5.5px;
      fill: var(--vscode-foreground);
      opacity: 0.55;
      dominant-baseline: middle;
      text-anchor: middle;
    }

    /* ── Info beside ring ── */
    .card-info { flex: 1; min-width: 0; }
    .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .info-pct { font-size: 22px; font-weight: 700; line-height: 1; }
    .info-time {
      font-size: 11px;
      opacity: 0.65;
      text-align: right;
    }
    .info-time .time-val { font-weight: 600; opacity: 1; }

    /* Linear bar underneath */
    .bar-track {
      height: 4px;
      border-radius: 2px;
      background: var(--vscode-widget-border, rgba(128,128,128,0.2));
      overflow: hidden;
      margin-top: 2px;
    }
    .bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.5s ease, background 0.3s ease;
    }

    /* ── Stale banner ── */
    .stale-badge {
      display: inline-block;
      font-size: 10px;
      opacity: 0.55;
      font-style: italic;
      margin-left: 4px;
    }

    /* ── No-auth ── */
    .no-auth {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      opacity: 0.7;
    }
    .no-auth-icon { font-size: 28px; }
    .no-auth p { font-size: 12px; line-height: 1.5; }
    .no-auth .hint { opacity: 0.6; font-size: 11px; }

    /* ── Footer ── */
    .footer {
      margin-top: 8px;
      font-size: 10px;
      opacity: 0.4;
      text-align: center;
    }

    /* ── Style picker ── */
    .style-picker {
      margin-top: 14px;
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
      padding-top: 12px;
    }
    .section-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.5;
      margin-bottom: 8px;
    }
    .style-options { display: flex; flex-direction: column; gap: 2px; }
    .style-opt {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 7px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
      user-select: none;
    }
    .style-opt:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.1)); }
    .style-opt input[type="radio"] {
      accent-color: var(--vscode-focusBorder, #007fd4);
      cursor: pointer;
      flex-shrink: 0;
      width: 14px;
      height: 14px;
    }
    .style-opt-label { font-size: 12px; line-height: 1; }
    .style-opt-preview {
      font-size: 10px;
      opacity: 0.45;
      font-family: monospace;
      margin-left: auto;
    }

    /* ── Plan badge ── */
    .plan-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background, rgba(128,128,128,0.25));
      color: var(--vscode-badge-foreground, var(--vscode-foreground));
      opacity: 0.85;
      vertical-align: middle;
    }

    /* ── No-auth actions ── */
    .no-auth-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; margin-top: 12px; }
    .no-auth-action  { display: flex; flex-direction: column; gap: 3px; }
    .action-btn {
      padding: 5px 12px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      cursor: pointer;
      border-radius: 4px;
      width: 100%;
      transition: background 0.12s;
    }
    .action-btn--primary {
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .action-btn--primary:hover  { background: var(--vscode-button-hoverBackground); }
    .action-btn--secondary {
      border: 1px solid var(--vscode-button-secondaryBorder, rgba(128,128,128,0.4));
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }
    .action-btn--secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.1)); }
    .action-desc {
      font-size: 10px;
      opacity: 0.55;
      line-height: 1.4;
      text-align: center;
    }

    /* ── Overview bar chart ── */
    .ov-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .ov-row:last-child { margin-bottom: 0; }
    .ov-label {
      font-size: 11px;
      min-width: 72px;
      flex-shrink: 0;
      opacity: 0.75;
    }
    .ov-track {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: var(--vscode-widget-border, rgba(128,128,128,0.2));
      overflow: hidden;
    }
    .ov-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease, background 0.3s ease;
    }
    .ov-pct {
      font-size: 11px;
      font-weight: 600;
      min-width: 34px;
      text-align: right;
    }

    /* ── Skills section ── */
    .skills-search {
      width: 100%;
      padding: 5px 8px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
      border-radius: 4px;
      outline: none;
      margin-bottom: 6px;
    }
    .skills-search:focus {
      border-color: var(--vscode-focusBorder, #007fd4);
    }
    .skills-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .skills-placeholder {
      font-size: 11px;
      opacity: 0.45;
      padding: 4px 2px;
    }
    .skill-item {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 5px 7px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .skill-item:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.1)); }
    .skill-item.installed::after {
      content: '✓';
      margin-left: auto;
      font-size: 10px;
      opacity: 0.6;
      color: var(--vscode-charts-green, #4caf74);
    }
    .skill-name { font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .skill-source { font-size: 10px; opacity: 0.5; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .skill-installs { font-size: 10px; opacity: 0.45; flex-shrink: 0; margin-left: auto; }
    .skills-refine {
      font-size: 10px;
      opacity: 0.5;
      font-style: italic;
      padding: 4px 2px 0;
    }

    /* ── Skill preview panel ── */
    .skill-preview {
      margin-top: 8px;
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      border-radius: 6px;
      overflow: hidden;
    }
    .skill-preview-header {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 8px 10px 6px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
    }
    .skill-preview-name { font-size: 12px; font-weight: 600; }
    .skill-preview-source { font-size: 10px; opacity: 0.5; }
    .skill-preview-content {
      font-size: 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      line-height: 1.5;
      padding: 8px 10px;
      max-height: 160px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.06));
    }
    .skill-preview-actions {
      display: flex;
      gap: 6px;
      padding: 8px 10px;
      background: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
    }
    .skill-preview-feedback {
      padding: 4px 10px 6px;
      font-size: 11px;
      background: var(--vscode-editor-background);
    }
    .skill-preview-feedback.success { color: var(--vscode-charts-green, #4caf74); }
    .skill-preview-feedback.error   { color: var(--vscode-errorForeground, #f44); }

    /* ── Tabs ── */
    .tab-bar {
      display: flex;
      gap: 0;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    }
    .tab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 5px 12px 6px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      cursor: pointer;
      opacity: 0.55;
      transition: opacity 0.12s, border-color 0.12s;
      margin-bottom: -1px;
    }
    .tab:hover { opacity: 0.85; }
    .tab.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder, #007fd4);
      font-weight: 600;
    }
    .tab-panel > .style-picker:first-child {
      border-top: none;
      margin-top: 0;
      padding-top: 0;
    }

    /* ── Helpers ── */
    .hidden { display: none !important; }
    @keyframes spin { to { transform: rotate(360deg); } }
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

  <div class="tab-bar">
    <button class="tab active" data-tab="usage">${i18n.tabUsage}</button>
    <button class="tab" data-tab="skills">${i18n.skillsLabel}</button>
  </div>

  <div id="tab-usage" class="tab-panel">

  <div id="cards">
    ${makeOverviewCard(i18n, currentViewMode === 'compact')}
    ${makeCard('session', i18n.session, i18n.session5h, i18n.stale, i18n.used, currentViewMode === 'compact')}
    ${makeCard('weekly',  i18n.weekly,  i18n.weekly7d,  i18n.stale, i18n.used, currentViewMode === 'compact')}
  </div>

  <div id="noAuth" class="no-auth hidden">
    <div class="no-auth-icon">⚠</div>
    <p>${i18n.notAuth}</p>
    <p class="hint">${i18n.notAuthHint}</p>
    <div class="no-auth-actions">
      <div class="no-auth-action">
        <button class="action-btn action-btn--primary" id="setTokenBtn">${i18n.setTokenBtn}</button>
        <span class="action-desc">${i18n.tokenOnlyDesc}</span>
      </div>
      <div class="no-auth-action">
        <button class="action-btn action-btn--secondary" id="setCredPathBtn">${i18n.setCredPathBtn}</button>
        <span class="action-desc">${i18n.credPathDesc}</span>
      </div>
    </div>
  </div>

  <div class="style-picker">
    <div class="section-label">${i18n.viewModeLabel}</div>
    <div class="style-options">
      <label class="style-opt">
        <input type="radio" name="viewMode" value="extended">
        <span class="style-opt-label">${i18n.extended}</span>
        <span class="style-opt-preview">${i18n.extendedDesc}</span>
      </label>
      <label class="style-opt">
        <input type="radio" name="viewMode" value="compact">
        <span class="style-opt-label">${i18n.compact}</span>
        <span class="style-opt-preview">${i18n.compactDesc}</span>
      </label>
    </div>
  </div>

  <div class="style-picker">
    <div class="section-label">${i18n.styleLabel}</div>
    <div class="style-options">
      <label class="style-opt">
        <input type="radio" name="barStyle" value="gradient">
        <span class="style-opt-label">${i18n.gradient}</span>
        <span class="style-opt-preview">▰▰▰▰▰▱▱▱▱▱</span>
      </label>
      <label class="style-opt">
        <input type="radio" name="barStyle" value="blocks">
        <span class="style-opt-label">${i18n.blocks}</span>
        <span class="style-opt-preview">█████░░░░░</span>
      </label>
      <label class="style-opt">
        <input type="radio" name="barStyle" value="icon-only">
        <span class="style-opt-label">${i18n.iconOnly}</span>
        <span class="style-opt-preview">✓ / ⚠ / ✖</span>
      </label>
      <label class="style-opt">
        <input type="radio" name="barStyle" value="icon+gradient">
        <span class="style-opt-label">${i18n.iconGradient}</span>
        <span class="style-opt-preview">✓ ▰▰▰▰▰▱▱▱▱▱</span>
      </label>
    </div>
  </div>

  <div class="footer" id="footer"></div>

  </div><!-- #tab-usage -->

  <div id="tab-skills" class="tab-panel hidden">
    <input
      class="skills-search"
      id="skillsSearch"
      type="text"
      placeholder="${i18n.skillsSearch}"
      autocomplete="off"
    />
    <ul class="skills-list" id="skillsList">
      <li class="skills-placeholder">${i18n.skillsEmpty}</li>
    </ul>
    <p class="skills-refine hidden" id="skillsRefine">${i18n.skillsRefine}</p>
    <div class="skill-preview hidden" id="skillPreview">
      <div class="skill-preview-header">
        <span class="skill-preview-name" id="previewName"></span>
        <span class="skill-preview-source" id="previewSource"></span>
      </div>
      <pre class="skill-preview-content" id="previewContent"></pre>
      <div class="skill-preview-actions">
        <button class="action-btn action-btn--primary" id="btnInstall">${i18n.skillsInstall}</button>
        <button class="action-btn action-btn--secondary" id="btnCancel">${i18n.skillsCancel}</button>
      </div>
      <div class="skill-preview-feedback hidden" id="installFeedback"></div>
    </div>
  </div><!-- #tab-skills -->

<script nonce="${nonce}">
  const INITIAL_STYLE = ${JSON.stringify(currentStyle)};
  const INITIAL_VIEW_MODE = ${JSON.stringify(currentViewMode)};
  const I18N = ${JSON.stringify(i18n)};
  const vscode = acquireVsCodeApi();

  // ── Tab switching ──
  (function () {
    const panels = {
      usage:  document.getElementById('tab-usage'),
      skills: document.getElementById('tab-skills'),
    };
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.tab;
        document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
        Object.entries(panels).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
      });
    });
  })();

  function doRefresh() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    vscode.postMessage({ type: 'refresh' });
    setTimeout(() => btn.classList.remove('spinning'), 800);
  }

  function doSetToken() {
    vscode.postMessage({ type: 'setToken' });
  }

  function doSetCredPath() {
    vscode.postMessage({ type: 'setCredentialsPath' });
  }

  function colorForPct(pct, warn) {
    if (pct >= 95)   return 'var(--vscode-statusBarItem-errorBackground, #c0392b)';
    if (pct >= warn) return 'var(--vscode-statusBarItem-warningBackground, #d68910)';
    return 'var(--vscode-charts-green, #4caf74)';
  }

  function updateCard(id, pct, resetsAt, stale, warn) {
    const card  = document.getElementById(id + '-card');
    const fill  = document.getElementById(id + '-fill');
    const bar   = document.getElementById(id + '-bar');
    const pctEl = document.getElementById(id + '-pct');
    const timeEl= document.getElementById(id + '-time');
    const staleEl = document.getElementById(id + '-stale');

    const color = colorForPct(pct, warn);

    // Ring: circumference of r=15.9155 ≈ 100
    fill.setAttribute('stroke-dasharray', pct + ' 100');
    fill.setAttribute('stroke', color);
    bar.style.width  = pct + '%';
    bar.style.background = color;
    pctEl.textContent = pct + '%';

    // Time left
    const timeLeft = resetsAt ? formatTimeLeft(resetsAt) : '';
    timeEl.innerHTML = timeLeft
      ? '<span class="time-val">' + timeLeft + '</span>'
      : '<span style="opacity:0.4">' + I18N.noResetTime + '</span>';

    // Stale
    staleEl.classList.toggle('hidden', !stale);

    // Card border colour (preserve 'hidden' class set by applyViewMode)
    card.classList.remove('error', 'warn');
    if (pct >= 95) card.classList.add('error');
    else if (pct >= warn) card.classList.add('warn');
  }

  // Minimal formatTimeLeft mirrored from utils.ts
  function formatTimeLeft(resetsAt) {
    const diffMs = new Date(resetsAt).getTime() - Date.now();
    if (diffMs <= 0) return '';
    const m = Math.floor(diffMs / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d >= 1) return I18N.dLeft.replace('{0}', d);
    if (h >= 1) return I18N.hLeft.replace('{0}', h);
    return I18N.mLeft.replace('{0}', m);
  }

  function updateOverview(sessionPct, weeklyPct, opusPct, hasOpus, stale, warn) {
    [['session', sessionPct], ['weekly', weeklyPct]].forEach(([key, pct]) => {
      document.getElementById('ov-' + key + '-fill').style.width = pct + '%';
      document.getElementById('ov-' + key + '-fill').style.background = colorForPct(pct, warn);
      document.getElementById('ov-' + key + '-pct').textContent = pct + '%';
    });
    const opusRow = document.getElementById('ov-opus-row');
    opusRow.classList.toggle('hidden', !hasOpus);
    if (hasOpus) {
      document.getElementById('ov-opus-fill').style.width = opusPct + '%';
      document.getElementById('ov-opus-fill').style.background = colorForPct(opusPct, warn);
      document.getElementById('ov-opus-pct').textContent = opusPct + '%';
    }
    document.getElementById('overview-stale').classList.toggle('hidden', !stale);
  }

  // Init style radio buttons
  function setStyleRadio(value) {
    document.querySelectorAll('input[name="barStyle"]').forEach((el) => {
      el.checked = el.value === value;
    });
  }
  setStyleRadio(INITIAL_STYLE);

  // Init view mode radio buttons
  function setViewModeRadio(value) {
    document.querySelectorAll('input[name="viewMode"]').forEach((el) => {
      el.checked = el.value === value;
    });
  }
  function applyViewMode(mode) {
    const isCompact = mode === 'compact';
    document.getElementById('session-card').classList.toggle('hidden', isCompact);
    document.getElementById('weekly-card').classList.toggle('hidden', isCompact);
    document.getElementById('overview-card').classList.toggle('hidden', !isCompact);
  }
  setViewModeRadio(INITIAL_VIEW_MODE);
  applyViewMode(INITIAL_VIEW_MODE);

  document.getElementById('refreshBtn').addEventListener('click', doRefresh);
  document.getElementById('setTokenBtn').addEventListener('click', doSetToken);
  document.getElementById('setCredPathBtn').addEventListener('click', doSetCredPath);

  document.querySelectorAll('input[name="barStyle"]').forEach((el) => {
    el.addEventListener('change', () => {
      if (el.checked) {
        vscode.postMessage({ type: 'changeStyle', value: el.value });
      }
    });
  });

  document.querySelectorAll('input[name="viewMode"]').forEach((el) => {
    el.addEventListener('change', () => {
      if (el.checked) {
        applyViewMode(el.value);
        vscode.postMessage({ type: 'changeViewMode', value: el.value });
      }
    });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    const warn = 80; // mirrored default; could pass from extension

    if (msg.type === 'styleChanged') {
      setStyleRadio(msg.value);
    }

    if (msg.type === 'viewModeChanged') {
      setViewModeRadio(msg.value);
      applyViewMode(msg.value);
    }

    if (msg.type === 'update') {
      document.getElementById('cards').classList.remove('hidden');
      document.getElementById('noAuth').classList.add('hidden');
      document.getElementById('planBadge').style.display = '';

      const d = msg.data;
      updateCard('session', Math.round(d.five_hour.utilization),  d.five_hour.resets_at,  msg.stale, warn);
      updateCard('weekly',  Math.round(d.seven_day.utilization),  d.seven_day.resets_at,  msg.stale, warn);
      const hasOpus = d.seven_day_opus != null;
      updateOverview(
        Math.round(d.five_hour.utilization),
        Math.round(d.seven_day.utilization),
        hasOpus ? Math.round(d.seven_day_opus.utilization) : 0,
        hasOpus,
        msg.stale,
        warn
      );

      document.getElementById('footer').textContent =
        I18N.updated + ' ' + new Date().toLocaleTimeString();
    }

    if (msg.type === 'noAuth') {
      document.getElementById('cards').classList.add('hidden');
      document.getElementById('noAuth').classList.remove('hidden');
      document.getElementById('planBadge').style.display = 'none';
      document.getElementById('footer').textContent = '';
    }
  });

  // ── Skills search & preview ──
  (function () {
    const searchInput  = document.getElementById('skillsSearch');
    const skillsList   = document.getElementById('skillsList');
    const refineWarn   = document.getElementById('skillsRefine');
    const skillPreview = document.getElementById('skillPreview');
    const previewName  = document.getElementById('previewName');
    const previewSrc   = document.getElementById('previewSource');
    const previewCont  = document.getElementById('previewContent');
    const btnInstall   = document.getElementById('btnInstall');
    const btnCancel    = document.getElementById('btnCancel');
    const feedback     = document.getElementById('installFeedback');
    let debounceTimer;
    let selectedSkill  = null;
    let installedIds   = [];

    function renderSkills(skills, count) {
      skillsList.innerHTML = '';
      refineWarn.classList.toggle('hidden', count < 50);

      if (!skills.length) {
        const li = document.createElement('li');
        li.className = 'skills-placeholder';
        li.textContent = I18N.skillsNoResults;
        skillsList.appendChild(li);
        return;
      }

      skills.forEach(function (skill) {
        const li = document.createElement('li');
        li.className = 'skill-item' + (installedIds.includes(skill.skillId) ? ' installed' : '');
        li.dataset.skillId = skill.skillId;
        li.innerHTML =
          '<span class="skill-name">' + skill.name + '</span>' +
          '<span class="skill-source">' + skill.source + '</span>' +
          '<span class="skill-installs">' + skill.installs + ' ' + I18N.skillsInstalls + '</span>';
        li.addEventListener('click', function () {
          vscode.postMessage({ type: 'selectSkill', skill: skill });
        });
        skillsList.appendChild(li);
      });
    }

    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      const query = searchInput.value.trim();
      if (query.length < 2) {
        skillsList.innerHTML = '<li class="skills-placeholder">' + I18N.skillsEmpty + '</li>';
        refineWarn.classList.add('hidden');
        return;
      }
      debounceTimer = setTimeout(function () {
        vscode.postMessage({ type: 'searchSkills', query: query });
      }, 400);
    });

    function showPreview(skill, content) {
      selectedSkill = skill;
      previewName.textContent = skill.name;
      previewSrc.textContent  = skill.source;
      previewCont.textContent = content;
      feedback.className = 'skill-preview-feedback hidden';
      feedback.textContent = '';
      btnInstall.disabled = false;
      btnInstall.textContent = I18N.skillsInstall;
      skillPreview.classList.remove('hidden');
    }

    function hidePreview() {
      skillPreview.classList.add('hidden');
      selectedSkill = null;
    }

    btnInstall.addEventListener('click', function () {
      if (!selectedSkill) { return; }
      btnInstall.disabled = true;
      btnInstall.textContent = I18N.skillsInstalling;
      feedback.className = 'skill-preview-feedback hidden';
      vscode.postMessage({ type: 'installSkill', skill: selectedSkill });
    });

    btnCancel.addEventListener('click', hidePreview);

    window.addEventListener('message', function (event) {
      const msg = event.data;
      if (msg.type === 'searchResults' || msg.type === 'cacheResults') {
        renderSkills(msg.skills, msg.count);
      }
      if (msg.type === 'installedSkills') {
        installedIds = msg.ids;
      }
      if (msg.type === 'skillPreview') {
        showPreview(msg.skill, msg.content);
      }
      if (msg.type === 'installSuccess') {
        if (!installedIds.includes(msg.skillId)) { installedIds.push(msg.skillId); }
        const item = skillsList.querySelector('[data-skill-id="' + msg.skillId + '"]');
        if (item) { item.classList.add('installed'); }
        feedback.textContent = I18N.skillsInstallOk;
        feedback.className = 'skill-preview-feedback success';
        btnInstall.textContent = I18N.skillsInstalled;
        setTimeout(hidePreview, 1500);
      }
      if (msg.type === 'installError') {
        feedback.textContent = I18N.skillsInstallErr + ' ' + msg.error;
        feedback.className = 'skill-preview-feedback error';
        btnInstall.disabled = false;
        btnInstall.textContent = I18N.skillsInstall;
      }
    });
  }());

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
    'claude_pro':     'Pro',
    'claude_free':    'Free',
    'claude_max_5x':  'Max 5×',
    'claude_max_20x': 'Max 20×',
    'claude_team':    'Team',
    'claude_enterprise': 'Enterprise',
  };
  return map[subscriptionType] ?? subscriptionType;
}

function makeOverviewCard(i18n: { overview: string; sessionLabel: string; weeklyLabel: string; opusLabel: string; stale: string }, isCompact: boolean): string {
  return /* html */`
  <div class="card${isCompact ? '' : ' hidden'}" id="overview-card">
    <div class="card-header">
      <span class="card-title">${i18n.overview}</span>
      <span class="stale-badge hidden" id="overview-stale">${i18n.stale}</span>
    </div>
    <div class="ov-row">
      <span class="ov-label">${i18n.sessionLabel}</span>
      <div class="ov-track"><div class="ov-fill" id="ov-session-fill" style="width:0%"></div></div>
      <span class="ov-pct" id="ov-session-pct">–</span>
    </div>
    <div class="ov-row">
      <span class="ov-label">${i18n.weeklyLabel}</span>
      <div class="ov-track"><div class="ov-fill" id="ov-weekly-fill" style="width:0%"></div></div>
      <span class="ov-pct" id="ov-weekly-pct">–</span>
    </div>
    <div class="ov-row" id="ov-opus-row">
      <span class="ov-label">${i18n.opusLabel}</span>
      <div class="ov-track"><div class="ov-fill" id="ov-opus-fill" style="width:0%"></div></div>
      <span class="ov-pct" id="ov-opus-pct">–</span>
    </div>
  </div>`;
}

function makeCard(id: string, title: string, sub: string, staleLabel: string, usedLabel: string, isCompact: boolean): string {
  return /* html */`
  <div class="card${isCompact ? ' hidden' : ''}" id="${id}-card">
    <div class="card-header">
      <span class="card-title">${title}</span>
      <span class="card-sub">${sub}</span>
      <span class="stale-badge hidden" id="${id}-stale">${staleLabel}</span>
    </div>
    <div class="card-body">
      <div class="ring-wrap">
        <svg viewBox="0 0 36 36">
          <circle class="ring-track" cx="18" cy="18" r="15.9155"
            fill="none" stroke-width="2.5"/>
          <circle class="ring-fill" id="${id}-fill" cx="18" cy="18" r="15.9155"
            fill="none" stroke-width="2.5"
            transform="rotate(-90 18 18)"
            stroke-dasharray="0 100"/>
          <text class="ring-pct" x="18" y="17" id="${id}-pct">–</text>
          <text class="ring-label" x="18" y="23">${usedLabel}</text>
        </svg>
      </div>
      <div class="card-info">
        <div class="info-time" id="${id}-time"></div>
        <div class="bar-track">
          <div class="bar-fill" id="${id}-bar" style="width:0%"></div>
        </div>
      </div>
    </div>
  </div>`;
}
