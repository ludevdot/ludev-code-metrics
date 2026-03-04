export function getSharedStyles(): string {
  return `
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
    .refresh-btn:hover { opacity: 1; }
    .refresh-btn.spinning { animation: spin 0.7s linear infinite; }

    /* ── Footer ── */
    .footer {
      margin-top: 8px;
      font-size: 10px;
      opacity: 0.4;
      text-align: center;
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
    .no-auth-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; margin-top: 12px; }
    .no-auth-action  { display: flex; flex-direction: column; gap: 3px; }

    /* ── Buttons ── */
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
  `;
}
