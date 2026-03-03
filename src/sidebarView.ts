import * as vscode from 'vscode';
import { getAccessToken } from './credentials';
import { fetchUsage, UsageLimits } from './usageApi';
import { formatTimeLeft } from './utils';

export class UsageSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeUsage.sidebar';

  private view?: vscode.WebviewView;
  private lastData: UsageLimits | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'refresh') {
        void this.refresh();
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.refresh();
      }
    });

    void this.refresh();
    this.startPolling();

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('claudeUsage.refreshInterval')) {
          this.restartPolling();
        }
      })
    );
  }

  async refresh(): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      this.post({ type: 'noAuth' });
      return;
    }
    try {
      const data = await fetchUsage(token);
      this.lastData = data;
      this.post({ type: 'update', data, stale: false });
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

  private startPolling(): void {
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const intervalSec = Math.max(30, config.get<number>('refreshInterval', 60));
    this.pollingInterval = setInterval(() => { void this.refresh(); }, intervalSec * 1000);
  }

  private restartPolling(): void {
    if (this.pollingInterval !== undefined) {
      clearInterval(this.pollingInterval);
    }
    this.startPolling();
  }

  dispose(): void {
    if (this.pollingInterval !== undefined) {
      clearInterval(this.pollingInterval);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = Array.from(
      { length: 32 },
      () => Math.random().toString(36)[2]
    ).join('');

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

    /* ── Helpers ── */
    .hidden { display: none !important; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>

  <div class="header">
    <h2>Claude Code Usage</h2>
    <button class="refresh-btn" id="refreshBtn" title="Refresh" onclick="doRefresh()">⟳</button>
  </div>

  <div id="cards">
    ${makeCard('session', 'Session', '5h window')}
    ${makeCard('weekly',  'Weekly',  '7-day window')}
  </div>

  <div id="noAuth" class="no-auth hidden">
    <div class="no-auth-icon">⚠</div>
    <p>Not authenticated</p>
    <p class="hint">Ensure Claude Code is installed and logged in, or set <code>claudeUsage.manualToken</code> in settings.</p>
  </div>

  <div class="footer" id="footer"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  function doRefresh() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    vscode.postMessage({ type: 'refresh' });
    setTimeout(() => btn.classList.remove('spinning'), 800);
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
      : '<span style="opacity:0.4">no reset time</span>';

    // Stale
    staleEl.classList.toggle('hidden', !stale);

    // Card border colour
    card.className = 'card' + (pct >= 95 ? ' error' : pct >= warn ? ' warn' : '');
  }

  // Minimal formatTimeLeft mirrored from utils.ts
  function formatTimeLeft(resetsAt) {
    const diffMs = new Date(resetsAt).getTime() - Date.now();
    if (diffMs <= 0) return '';
    const m = Math.floor(diffMs / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d >= 1) return d + 'd left';
    if (h >= 1) return h + 'h left';
    return m + 'm left';
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    const warn = 80; // mirrored default; could pass from extension

    if (msg.type === 'update') {
      document.getElementById('cards').classList.remove('hidden');
      document.getElementById('noAuth').classList.add('hidden');

      const d = msg.data;
      updateCard('session', Math.round(d.five_hour.utilization),  d.five_hour.resets_at,  msg.stale, warn);
      updateCard('weekly',  Math.round(d.seven_day.utilization),  d.seven_day.resets_at,  msg.stale, warn);

      document.getElementById('footer').textContent =
        'Updated ' + new Date().toLocaleTimeString();
    }

    if (msg.type === 'noAuth') {
      document.getElementById('cards').classList.add('hidden');
      document.getElementById('noAuth').classList.remove('hidden');
      document.getElementById('footer').textContent = '';
    }
  });
</script>
</body>
</html>`;
  }
}

function makeCard(id: string, title: string, sub: string): string {
  return /* html */`
  <div class="card" id="${id}-card">
    <div class="card-header">
      <span class="card-title">${title}</span>
      <span class="card-sub">${sub}</span>
      <span class="stale-badge hidden" id="${id}-stale">~ stale</span>
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
          <text class="ring-label" x="18" y="23">used</text>
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
