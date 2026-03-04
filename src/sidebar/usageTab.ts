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
      margin-bottom: 12px;
    }
    .card-title { font-size: 13px; font-weight: 600; }
    .card-sub   { font-size: 10px; opacity: 0.5; }

    /* ── Circular progress ── */
    .card-body {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .ring-wrap { flex-shrink: 0; position: relative; width: 72px; height: 72px; }
    .ring-wrap svg { width: 72px; height: 72px; }
    .ring-track { stroke: var(--vscode-widget-border, rgba(128,128,128,0.25)); }
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
    .info-time { font-size: 11px; opacity: 0.65; text-align: right; }
    .info-time .time-val { font-weight: 600; opacity: 1; }

    /* ── Linear bar ── */
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

    /* ── Overview bar chart ── */
    .ov-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .ov-row:last-child { margin-bottom: 0; }
    .ov-label { font-size: 11px; min-width: 72px; flex-shrink: 0; opacity: 0.75; }
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
    .ov-pct { font-size: 11px; font-weight: 600; min-width: 34px; text-align: right; }
  `;
}

export function makeOverviewCard(
  i18n: Pick<SidebarI18n, 'overview' | 'sessionLabel' | 'weeklyLabel' | 'opusLabel' | 'stale'>,
  isCompact: boolean
): string {
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

export function makeCard(
  id: string,
  title: string,
  sub: string,
  staleLabel: string,
  usedLabel: string,
  isCompact: boolean
): string {
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

export function getUsageTabHtml(i18n: SidebarI18n, currentViewMode: string): string {
  const isCompact = currentViewMode === 'compact';
  return /* html */`
  <div id="tab-usage" class="tab-panel">

  <div id="cards">
    ${makeOverviewCard(i18n, isCompact)}
    ${makeCard('session', i18n.session, i18n.session5h, i18n.stale, i18n.used, isCompact)}
    ${makeCard('weekly',  i18n.weekly,  i18n.weekly7d,  i18n.stale, i18n.used, isCompact)}
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

  </div><!-- #tab-usage -->`;
}

// Assumes I18N, INITIAL_VIEW_MODE, INITIAL_STYLE, vscode, colorForPct are defined in outer scope
export function getUsageTabScript(): string {
  return `
  function updateCard(id, pct, resetsAt, stale, warn) {
    const card    = document.getElementById(id + '-card');
    const fill    = document.getElementById(id + '-fill');
    const bar     = document.getElementById(id + '-bar');
    const pctEl   = document.getElementById(id + '-pct');
    const timeEl  = document.getElementById(id + '-time');
    const staleEl = document.getElementById(id + '-stale');
    const color   = colorForPct(pct, warn);

    fill.setAttribute('stroke-dasharray', pct + ' 100');
    fill.setAttribute('stroke', color);
    bar.style.width      = pct + '%';
    bar.style.background = color;
    pctEl.textContent    = pct + '%';

    const timeLeft = resetsAt ? formatTimeLeft(resetsAt) : '';
    timeEl.innerHTML = timeLeft
      ? '<span class="time-val">' + timeLeft + '</span>'
      : '<span style="opacity:0.4">' + I18N.noResetTime + '</span>';

    staleEl.classList.toggle('hidden', !stale);

    // Preserve 'hidden' class set by applyViewMode
    card.classList.remove('error', 'warn');
    if (pct >= 95) card.classList.add('error');
    else if (pct >= warn) card.classList.add('warn');
  }

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
    [['session', sessionPct], ['weekly', weeklyPct]].forEach(function ([key, pct]) {
      document.getElementById('ov-' + key + '-fill').style.width      = pct + '%';
      document.getElementById('ov-' + key + '-fill').style.background = colorForPct(pct, warn);
      document.getElementById('ov-' + key + '-pct').textContent       = pct + '%';
    });
    const opusRow = document.getElementById('ov-opus-row');
    opusRow.classList.toggle('hidden', !hasOpus);
    if (hasOpus) {
      document.getElementById('ov-opus-fill').style.width      = opusPct + '%';
      document.getElementById('ov-opus-fill').style.background = colorForPct(opusPct, warn);
      document.getElementById('ov-opus-pct').textContent       = opusPct + '%';
    }
    document.getElementById('overview-stale').classList.toggle('hidden', !stale);
  }

  function setStyleRadio(value) {
    document.querySelectorAll('input[name="barStyle"]').forEach(function (el) {
      el.checked = el.value === value;
    });
  }
  function setViewModeRadio(value) {
    document.querySelectorAll('input[name="viewMode"]').forEach(function (el) {
      el.checked = el.value === value;
    });
  }
  function applyViewMode(mode) {
    const isCompact = mode === 'compact';
    document.getElementById('session-card').classList.toggle('hidden', isCompact);
    document.getElementById('weekly-card').classList.toggle('hidden', isCompact);
    document.getElementById('overview-card').classList.toggle('hidden', !isCompact);
  }
  setStyleRadio(INITIAL_STYLE);
  setViewModeRadio(INITIAL_VIEW_MODE);
  applyViewMode(INITIAL_VIEW_MODE);

  document.querySelectorAll('input[name="barStyle"]').forEach(function (el) {
    el.addEventListener('change', function () {
      if (el.checked) { vscode.postMessage({ type: 'changeStyle', value: el.value }); }
    });
  });
  document.querySelectorAll('input[name="viewMode"]').forEach(function (el) {
    el.addEventListener('change', function () {
      if (el.checked) {
        applyViewMode(el.value);
        vscode.postMessage({ type: 'changeViewMode', value: el.value });
      }
    });
  });

  window.addEventListener('message', function (event) {
    const msg  = event.data;
    const warn = 80;

    if (msg.type === 'styleChanged') { setStyleRadio(msg.value); }

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
        hasOpus, msg.stale, warn
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

    if (msg.type === 'planUpdated') {
      const badge = document.getElementById('planBadge');
      if (msg.planLabel) {
        badge.textContent = msg.planLabel;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }

    if (msg.type === 'accountsUpdated') {
      const sel = document.getElementById('accountSelect');
      const manageBtn = document.getElementById('manageAccountsBtn');
      if (!sel) { return; }
      const hasAccounts = msg.accounts.length > 0;
      sel.classList.toggle('hidden', !hasAccounts);
      if (manageBtn) { manageBtn.classList.toggle('hidden', !hasAccounts); }
      sel.innerHTML = msg.accounts.map(function (o) {
        const selected = o.value === msg.activeLabel ? ' selected' : '';
        return '<option value="' + o.value + '"' + selected + '>' + o.label + '</option>';
      }).join('');
    }
  });
  `;
}
