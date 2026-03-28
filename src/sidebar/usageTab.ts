import type { SidebarI18n } from './types';

export function getUsageTabStyles(): string {
  return `
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
      margin-bottom: 10px;
    }
    .card-title { font-size: 13px; font-weight: 600; }
    .card-sub   { font-size: 10px; opacity: 0.5; }

    /* ── Simple usage bars (web console style) ── */
    .usage-bar-row {
      margin-bottom: 12px;
    }
    .usage-bar-row:last-child { margin-bottom: 0; }
    .usage-bar-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .usage-bar-label {
      font-size: 12px;
      font-weight: 600;
    }
    .usage-bar-pct {
      font-size: 12px;
      font-weight: 600;
    }
    .usage-bar-track {
      height: 6px;
      border-radius: 3px;
      background: var(--vscode-widget-border, rgba(128,128,128,0.2));
      overflow: hidden;
    }
    .usage-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease, background 0.3s ease;
    }
    .usage-bar-reset {
      font-size: 10px;
      opacity: 0.55;
      margin-top: 3px;
    }

    /* ── Stale banner ── */
    .stale-badge {
      display: inline-block;
      font-size: 10px;
      opacity: 0.55;
      font-style: italic;
      margin-left: 4px;
    }

    /* ── Auto-refresh ── */
    .auto-refresh-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      padding: 4px 0;
    }
    .toggle-switch {
      position: relative;
      width: 32px;
      height: 18px;
      flex-shrink: 0;
    }
    .toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
    .toggle-track {
      position: absolute;
      inset: 0;
      border-radius: 9px;
      background: var(--vscode-widget-border, rgba(128,128,128,0.35));
      transition: background 0.2s;
    }
    .toggle-track::after {
      content: '';
      position: absolute;
      left: 2px;
      top: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--vscode-foreground);
      opacity: 0.6;
      transition: transform 0.2s, opacity 0.2s;
    }
    .toggle-switch input:checked + .toggle-track {
      background: var(--vscode-focusBorder, #007fd4);
    }
    .toggle-switch input:checked + .toggle-track::after {
      transform: translateX(14px);
      opacity: 1;
    }
    .auto-refresh-toggle-label { font-size: 12px; }
    .auto-refresh-interval {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 0 4px 40px;
    }
    .auto-refresh-interval label { font-size: 11px; opacity: 0.7; white-space: nowrap; }
    .auto-refresh-interval input[type="number"] {
      width: 48px;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-input-foreground, var(--vscode-foreground));
      background: var(--vscode-input-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
      border-radius: 3px;
      padding: 2px 4px;
      text-align: center;
    }
    .auto-refresh-interval input[type="number"]:focus {
      outline: 1px solid var(--vscode-focusBorder, #007fd4);
      outline-offset: -1px;
    }
    .auto-refresh-interval span { font-size: 11px; opacity: 0.7; }
    .auto-refresh-hint {
      font-size: 10px;
      opacity: 0.5;
      line-height: 1.45;
      padding: 6px 0 0;
      font-style: italic;
    }

    /* ── Loading pulse ── */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.35; }
    }
    .card.loading .usage-bar-fill,
    .card.loading .usage-bar-pct,
    .card.loading .usage-bar-reset {
      animation: pulse 1.2s ease-in-out infinite;
    }

    /* ── Context section (merged from contextTab) ── */
    .ctx-no-session {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      opacity: 0.7;
    }
    .ctx-no-session-icon { font-size: 28px; }
    .ctx-no-session p { font-size: 12px; line-height: 1.5; }

    .ctx-session-selector {
      margin-bottom: 10px;
    }
    .ctx-session-selector label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.5;
      display: block;
      margin-bottom: 4px;
    }
    .ctx-session-select {
      width: 100%;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,0.3));
      border-radius: 4px;
      padding: 3px 6px;
      cursor: pointer;
    }
    .ctx-session-select:focus {
      outline: 1px solid var(--vscode-focusBorder, #007fd4);
      outline-offset: -1px;
    }

    .ctx-stats {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .ctx-stat-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      border-radius: 8px;
      padding: 12px 14px;
    }
    .ctx-stat-header {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.5;
      margin-bottom: 8px;
    }

    .ctx-token-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .ctx-token-row:last-child { margin-bottom: 0; }
    .ctx-token-label {
      font-size: 11px;
      min-width: 80px;
      flex-shrink: 0;
      opacity: 0.75;
    }
    .ctx-token-bar {
      flex: 1;
      height: 5px;
      border-radius: 3px;
      background: var(--vscode-widget-border, rgba(128,128,128,0.2));
      overflow: hidden;
    }
    .ctx-token-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.4s ease;
    }
    .ctx-token-fill.input    { background: var(--vscode-charts-blue, #4a90d9); }
    .ctx-token-fill.output   { background: var(--vscode-charts-orange, #d68910); }
    .ctx-token-fill.cache-read { background: var(--vscode-charts-green, #4caf74); }
    .ctx-token-fill.cache-write { background: var(--vscode-charts-purple, #a855f7); }
    .ctx-token-value {
      font-size: 11px;
      font-weight: 600;
      min-width: 50px;
      text-align: right;
    }

    .ctx-summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .ctx-summary-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ctx-summary-label {
      font-size: 10px;
      opacity: 0.55;
    }
    .ctx-summary-value {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
    }
    .ctx-summary-value.cost {
      color: var(--vscode-charts-green, #4caf74);
    }

    .ctx-model-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background, rgba(128,128,128,0.25));
      color: var(--vscode-badge-foreground, var(--vscode-foreground));
      margin-right: 4px;
      margin-bottom: 4px;
    }

    .ctx-section-divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
      margin: 14px 0;
    }

    /* ── Compact no-auth (smaller than before) ── */
    .no-auth-compact {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      font-size: 11px;
      opacity: 0.6;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      border-radius: 6px;
      margin-bottom: 10px;
    }
    .no-auth-compact-icon { font-size: 14px; flex-shrink: 0; }
    .no-auth-compact-text { flex: 1; }
  `;
}

export function getUsageTabHtml(i18n: SidebarI18n): string {
  return /* html */`
  <div id="tab-usage" class="tab-panel">

  <!-- Usage bars (only shown when authenticated) -->
  <div id="usageBars" class="card hidden">
    <div class="usage-bar-row">
      <div class="usage-bar-top">
        <span class="usage-bar-label">${i18n.sessionLabel}</span>
        <span class="usage-bar-pct" id="session-pct">--</span>
      </div>
      <div class="usage-bar-track"><div class="usage-bar-fill" id="session-fill" style="width:0%"></div></div>
      <div class="usage-bar-reset" id="session-reset"></div>
    </div>
    <div class="usage-bar-row">
      <div class="usage-bar-top">
        <span class="usage-bar-label">${i18n.weeklyLabel}</span>
        <span class="usage-bar-pct" id="weekly-pct">--</span>
      </div>
      <div class="usage-bar-track"><div class="usage-bar-fill" id="weekly-fill" style="width:0%"></div></div>
      <div class="usage-bar-reset" id="weekly-reset"></div>
    </div>
    <span class="stale-badge hidden" id="usage-stale">${i18n.stale}</span>
  </div>

  <!-- No-auth: compact warning + auth actions together -->
  <div id="noAuth" class="hidden">
    <div class="no-auth-compact">
      <span class="no-auth-compact-icon">&#x26A0;</span>
      <span class="no-auth-compact-text">${i18n.notAuth}</span>
    </div>
    <div class="no-auth-hint" style="font-size:11px;opacity:0.6;margin:6px 0 10px;line-height:1.4;">
      ${i18n.notAuthHint}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;width:100%;margin-bottom:12px;">
      <div style="display:flex;flex-direction:column;gap:3px;">
        <button class="action-btn action-btn--primary" id="setTokenBtn">${i18n.setTokenBtn}</button>
        <span class="action-desc">${i18n.tokenOnlyDesc}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;">
        <button class="action-btn action-btn--secondary" id="setCredPathBtn">${i18n.setCredPathBtn}</button>
        <span class="action-desc">${i18n.credPathDesc}</span>
      </div>
    </div>
  </div>

  <!-- Context section (always shown — local data) -->
  <div id="ctxSection">
    <div id="ctxNoSession" class="ctx-no-session">
      <div class="ctx-no-session-icon">&#x26A1;</div>
      <p>${i18n.ctxNoSession}</p>
    </div>

    <div id="ctxContent" class="hidden">
      <div class="ctx-session-selector hidden" id="ctxSessionSelector">
        <label>${i18n.ctxSessionLabel}</label>
        <select class="ctx-session-select" id="ctxSessionSelect"></select>
      </div>

      <div class="ctx-stats">
        <div class="ctx-stat-card">
          <div class="ctx-stat-header">${i18n.ctxTokenBreakdown}</div>
          <div class="ctx-token-row">
            <span class="ctx-token-label">${i18n.ctxInput}</span>
            <div class="ctx-token-bar"><div class="ctx-token-fill input" id="ctxInputFill" style="width:0%"></div></div>
            <span class="ctx-token-value" id="ctxInputVal">0</span>
          </div>
          <div class="ctx-token-row">
            <span class="ctx-token-label">${i18n.ctxOutput}</span>
            <div class="ctx-token-bar"><div class="ctx-token-fill output" id="ctxOutputFill" style="width:0%"></div></div>
            <span class="ctx-token-value" id="ctxOutputVal">0</span>
          </div>
          <div class="ctx-token-row">
            <span class="ctx-token-label">${i18n.ctxCacheRead}</span>
            <div class="ctx-token-bar"><div class="ctx-token-fill cache-read" id="ctxCacheReadFill" style="width:0%"></div></div>
            <span class="ctx-token-value" id="ctxCacheReadVal">0</span>
          </div>
          <div class="ctx-token-row">
            <span class="ctx-token-label">${i18n.ctxCacheWrite}</span>
            <div class="ctx-token-bar"><div class="ctx-token-fill cache-write" id="ctxCacheWriteFill" style="width:0%"></div></div>
            <span class="ctx-token-value" id="ctxCacheWriteVal">0</span>
          </div>
        </div>

        <div class="ctx-stat-card">
          <div class="ctx-stat-header">${i18n.ctxSummary}</div>
          <div class="ctx-summary-grid">
            <div class="ctx-summary-item">
              <span class="ctx-summary-label">${i18n.ctxCostLabel}</span>
              <span class="ctx-summary-value cost" id="ctxCost">$0.00</span>
            </div>
            <div class="ctx-summary-item">
              <span class="ctx-summary-label">${i18n.ctxResponses}</span>
              <span class="ctx-summary-value" id="ctxResponses">0</span>
            </div>
            <div class="ctx-summary-item">
              <span class="ctx-summary-label">${i18n.ctxDuration}</span>
              <span class="ctx-summary-value" id="ctxDuration">--</span>
            </div>
            <div class="ctx-summary-item">
              <span class="ctx-summary-label">${i18n.ctxTotalTokens}</span>
              <span class="ctx-summary-value" id="ctxTotalTokens">0</span>
            </div>
          </div>
        </div>

        <div class="ctx-stat-card" id="ctxModelsCard">
          <div class="ctx-stat-header">${i18n.ctxModels}</div>
          <div id="ctxModelsList"></div>
        </div>
      </div>
    </div>
  </div><!-- #ctxSection -->

  <!-- noAuthActions anchor kept for JS compat -->
  <div id="noAuthActions" class="hidden"></div>

  <div class="footer" id="footer"></div>

  </div><!-- #tab-usage -->`;
}

// Assumes I18N, INITIAL_VIEW_MODE, vscode, colorForPct are defined in outer scope
export function getUsageTabScript(): string {
  return `
  function formatTimeLeft(resetsAt) {
    var diffMs = new Date(resetsAt).getTime() - Date.now();
    if (diffMs <= 0) return '';
    var m = Math.floor(diffMs / 60000);
    var h = Math.floor(m / 60);
    var d = Math.floor(h / 24);
    if (d >= 1) return I18N.dLeft.replace('{0}', d);
    if (h >= 1) return I18N.hLeft.replace('{0}', h);
    return I18N.mLeft.replace('{0}', m);
  }

  function updateUsageBar(id, pct, resetsAt, warn) {
    var fill  = document.getElementById(id + '-fill');
    var pctEl = document.getElementById(id + '-pct');
    var reset = document.getElementById(id + '-reset');
    var color = colorForPct(pct, warn);

    fill.style.width      = pct + '%';
    fill.style.background = color;
    pctEl.textContent     = pct + '% ' + I18N.used;

    var timeLeft = resetsAt ? formatTimeLeft(resetsAt) : '';
    reset.textContent = timeLeft
      ? I18N.mLeft.replace('{0}', '').replace(/\\s*$/, '') !== '' ? timeLeft : timeLeft
      : '';
    // Show reset time as descriptive text
    if (timeLeft) {
      reset.textContent = timeLeft;
    } else {
      reset.textContent = '';
    }
  }

  window.addEventListener('message', function (event) {
    var msg  = event.data;
    var warn = 80;

    if (msg.type === 'loading') {
      document.getElementById('usageBars').classList.add('loading');
    }

    if (msg.type === 'update') {
      var bars = document.getElementById('usageBars');
      bars.classList.remove('loading', 'hidden');
      bars.classList.remove('error', 'warn');
      document.getElementById('noAuth').classList.add('hidden');
      document.getElementById('noAuthActions').classList.add('hidden');
      document.getElementById('planBadge').style.display = '';

      var d = msg.data;
      var sessionPct = Math.round(d.five_hour.utilization);
      var weeklyPct  = Math.round(d.seven_day.utilization);
      updateUsageBar('session', sessionPct, d.five_hour.resets_at, warn);
      updateUsageBar('weekly',  weeklyPct,  d.seven_day.resets_at, warn);

      // Apply warn/error border to the card
      var maxPct = Math.max(sessionPct, weeklyPct);
      if (maxPct >= 95) bars.classList.add('error');
      else if (maxPct >= warn) bars.classList.add('warn');

      document.getElementById('usage-stale').classList.toggle('hidden', !msg.stale);

      document.getElementById('footer').textContent =
        I18N.updated + ' ' + new Date().toLocaleTimeString();
    }

    if (msg.type === 'noAuth') {
      document.getElementById('usageBars').classList.remove('loading');
      document.getElementById('usageBars').classList.add('hidden');
      document.getElementById('noAuth').classList.remove('hidden');
      document.getElementById('noAuthActions').classList.remove('hidden');
      document.getElementById('planBadge').style.display = 'none';
      document.getElementById('footer').textContent = '';
    }

    if (msg.type === 'autoRefreshChanged') {
      window._applyAutoRefreshState(msg.enabled, msg.minutes);
    }

    if (msg.type === 'planUpdated') {
      var badge = document.getElementById('planBadge');
      if (msg.planLabel) {
        badge.textContent = msg.planLabel;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  });

  // ── Context section script (merged from contextTab) ──
  (function () {
    var ctxSessionSelect = document.getElementById('ctxSessionSelect');

    function formatTokens(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
    }

    function formatDuration(ms) {
      if (!ms || ms <= 0) return '--';
      var m = Math.floor(ms / 60000);
      var h = Math.floor(m / 60);
      if (h >= 1) return h + 'h ' + (m % 60) + 'm';
      return m + 'm';
    }

    function updateContextUI(data) {
      var noSession = document.getElementById('ctxNoSession');
      var content = document.getElementById('ctxContent');

      if (!data || !data.metrics) {
        noSession.classList.remove('hidden');
        content.classList.add('hidden');
        return;
      }

      noSession.classList.add('hidden');
      content.classList.remove('hidden');

      var m = data.metrics;
      var total = m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreationTokens;
      var maxTok = Math.max(m.inputTokens, m.outputTokens, m.cacheReadTokens, m.cacheCreationTokens, 1);

      document.getElementById('ctxInputFill').style.width = ((m.inputTokens / maxTok) * 100) + '%';
      document.getElementById('ctxOutputFill').style.width = ((m.outputTokens / maxTok) * 100) + '%';
      document.getElementById('ctxCacheReadFill').style.width = ((m.cacheReadTokens / maxTok) * 100) + '%';
      document.getElementById('ctxCacheWriteFill').style.width = ((m.cacheCreationTokens / maxTok) * 100) + '%';

      document.getElementById('ctxInputVal').textContent = formatTokens(m.inputTokens);
      document.getElementById('ctxOutputVal').textContent = formatTokens(m.outputTokens);
      document.getElementById('ctxCacheReadVal').textContent = formatTokens(m.cacheReadTokens);
      document.getElementById('ctxCacheWriteVal').textContent = formatTokens(m.cacheCreationTokens);

      var cost = data.cost ? data.cost.totalCost : 0;
      document.getElementById('ctxCost').textContent = '$' + cost.toFixed(2);
      document.getElementById('ctxResponses').textContent = String(m.responseCount);
      document.getElementById('ctxTotalTokens').textContent = formatTokens(total);

      var duration = 0;
      if (m.firstResponseAt && m.lastResponseAt) {
        duration = new Date(m.lastResponseAt).getTime() - new Date(m.firstResponseAt).getTime();
      }
      document.getElementById('ctxDuration').textContent = formatDuration(duration);

      // Models
      var modelsList = document.getElementById('ctxModelsList');
      var modelsCard = document.getElementById('ctxModelsCard');
      if (data.models && data.models.length > 0) {
        modelsCard.classList.remove('hidden');
        modelsList.innerHTML = data.models.map(function (m) {
          return '<span class="ctx-model-badge">' + m + '</span>';
        }).join('');
      } else {
        modelsCard.classList.add('hidden');
      }
    }

    // Session selector
    function updateSessionSelector(sessions, selectedIndex) {
      var selectorWrap = document.getElementById('ctxSessionSelector');
      if (!sessions || sessions.length <= 1) {
        selectorWrap.classList.add('hidden');
        return;
      }
      selectorWrap.classList.remove('hidden');
      var idx = selectedIndex || 0;
      ctxSessionSelect.innerHTML = sessions.map(function (s, i) {
        var label = 'PID ' + s.pid + ' - ' + new Date(s.startedAt).toLocaleTimeString();
        return '<option value="' + i + '"' + (i === idx ? ' selected' : '') + '>' + label + '</option>';
      }).join('');
    }

    ctxSessionSelect.addEventListener('change', function () {
      vscode.postMessage({ type: 'contextSelectSession', index: parseInt(ctxSessionSelect.value, 10) });
    });

    window.addEventListener('message', function (event) {
      var msg = event.data;
      if (msg.type === 'contextUpdate') {
        updateContextUI(msg);
        if (msg.sessions) { updateSessionSelector(msg.sessions, msg.selectedIndex); }
      }
      if (msg.type === 'contextLoading') {
        // Could add a loading state here
      }
      if (msg.type === 'contextError') {
        document.getElementById('ctxNoSession').classList.remove('hidden');
        document.getElementById('ctxContent').classList.add('hidden');
      }
    });
  }());
  `;
}
