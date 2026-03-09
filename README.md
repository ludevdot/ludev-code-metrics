# Claude Code Usage

A VS Code extension that shows your [Claude Code](https://claude.ai/code) subscription usage — session (5h) and weekly (7d) — directly in the Status Bar and in a dedicated sidebar panel.

<!-- TOC -->

- [Claude Code Usage](#claude-code-usage)
- [Features](#features)
- [Quick Start](#quick-start)
- [Status Bar](#status-bar)
- [Sidebar Panel](#sidebar-panel)
- [Skills Browser](#skills-browser)
- [Configuration](#configuration)
- [Credential Resolution](#credential-resolution)
- [Internationalization](#internationalization)
- [Architecture](#architecture)
- [Testing](#testing)
- [Change Log](#change-log)
- [Contributing](#contributing)

<!-- /TOC -->

## Features

1. **Status Bar items** — live session and weekly usage at a glance, always visible.
2. **Four display styles** — gradient (`▰▱`), blocks (`█░`), icon-only, or icon + gradient bar.
3. **Dynamic colors** — green text in normal state → warning background → error background as usage rises.
4. **Sidebar panel** — Activity Bar icon opens a panel with SVG circular progress rings, a linear bar, and reset countdowns.
5. **Style picker** — radio buttons inside the panel to switch styles instantly, no settings file needed.
6. **Overview card** — compact linear summary of Session (5h), Weekly (7d), and Opus (7d) usage in a single glance; the Opus row is hidden automatically when no Opus data is available.
7. **Compact / Extended mode** — toggle between *Extended* (Session + Weekly detail cards) and *Compact* (Overview summary only) directly from the panel; preference is persisted per-user.
8. **Subscription plan badge** — displays your plan (Free, Pro, Max 5×, Max 20×, Team…) in the sidebar header, read from local credentials.
9. **Skills browser** — search and install Claude Code skills from [skills.sh](https://skills.sh) directly from the sidebar; installs into the current workspace's `.claude/skills/` directory.
10. **Persistent tab** — the sidebar remembers the last open tab (Usage or Skills) between panel hide/show cycles.
11. **Multilingual UI** — automatically follows VS Code's display language (English, Spanish, Italian, French).
12. **Stale indicator** — shows `~` when the last fetch failed but cached data is available.
13. **Cross-platform credentials** — reads automatically from `~/.claude/.credentials.json` (written by Claude Code CLI). No manual token setup required in most cases.
14. **Click to refresh** — clicking either status bar item triggers an immediate update.
15. **Enter token manually** — Command Palette command and sidebar button to paste a raw OAuth token when automatic resolution fails.
16. **Set credentials path** — Command Palette command and sidebar button to point to a custom credentials JSON file; unlocks the plan badge in addition to usage data.
17. **Startup notification** — if no credentials are found at launch, a notification appears with an option to set credentials immediately or skip.
18. **Activity Bar badge** — the sidebar icon shows a `1` badge while no credentials are configured, disappearing once a valid token is found.

## Quick Start

1. Install the extension from the VS Code Extension menu or the Marketplace.
2. Make sure [Claude Code CLI](https://claude.ai/code) is installed and you are logged in — credentials are read automatically.
3. The two status bar items appear on the right side of the Status Bar immediately.
4. Click the clock icon in the Activity Bar to open the usage panel.

> If credentials are not found automatically, open the Command Palette (`Cmd/Ctrl + Shift + P`) and run **Claude Usage: Enter Token Manually**, or click the **Enter token manually** button in the sidebar panel.

## Status Bar

Two items are shown on the right side of the Status Bar:

| Item | Priority | Default format |
|------|----------|----------------|
| Session (5h rolling) | Right, 100 | `$(clock) ▰▰▰▰▰▱▱▱▱▱ Session: 45% · 2h left` |
| Weekly (7d rolling)  | Right, 99  | `$(calendar) ▰▰▰▰▱▱▱▱▱▱ Weekly: 26% · 3d left` |

Colors change automatically:

| Threshold | Effect |
|-----------|--------|
| < `warningThreshold` (default 80%) | Text colored `charts.green` so the progress bar stands out |
| ≥ `warningThreshold` | `statusBarItem.warningBackground` (orange) |
| ≥ 95% | `statusBarItem.errorBackground` (red) |

Clicking either item refreshes immediately.

## Sidebar Panel

Click the gauge icon in the Activity Bar to open the **Claude Code Usage** panel.

The panel shows:

- **Circular SVG progress ring** — fills and changes colour with usage level.
- **Linear bar** — secondary visual below the ring info.
- **Reset countdown** — "2h left", "3d left", etc.
- **Subscription plan badge** — your plan (Free, Pro, Max 5×…) shown in the header when credentials are loaded from the local store (Keychain or `~/.claude/.credentials.json`). Hidden in the no-auth state, and not shown when using a manual token (see note below).
- **Stale badge** — appears if the last API call failed and cached data is shown.
- **Refresh button** — triggers an immediate API call (30-second cooldown to avoid rate limits).
- **Enter token manually button** — shown in the no-auth state; opens an input box to paste a raw token. Usage data loads but the plan badge will not appear.
- **Set credentials path button** — shown alongside the token button; opens a native file picker to select the Claude Code credentials JSON. Provides full credentials including the plan badge.
- **Activity Bar badge (`1`)** — visible on the sidebar icon whenever no credentials are configured.
- **Overview card** — compact linear progress bars for Session (5h), Weekly (7d), and Opus (7d) all in one row. Visible in *Compact* mode. The Opus row is hidden if the API returns no Opus data.
- **View mode toggle** — *Extended* (default) shows the Session and Weekly detail cards; *Compact* shows the Overview card only. Switching saves the preference to VS Code settings.
- **Style picker** — four radio buttons to switch the Status Bar display style live.
- **Last updated** timestamp at the bottom.

## Skills Browser

The **Skills** tab in the sidebar lets you discover and install [skills.sh](https://skills.sh) skills without leaving VS Code.

- **Auto-load** — the skill list loads automatically the first time you open the tab (top 50 results).
- **Search** — type two or more characters to filter skills by name.
- **Per-skill actions** — each result shows two buttons:
  - **Install** — downloads `SKILL.md` from GitHub and writes it to `.claude/skills/<skillId>/SKILL.md` in your current workspace, then updates `skills-lock.json`.
  - **View on skills.sh** — opens the skill's page in your browser.
- **Installed indicator** — once installed, the Install button turns green and is disabled.
- **Result cap** — when 50 results are returned a hint appears to refine the query.

> Skills are installed **per workspace**, not globally. Requires an open workspace folder.

## Configuration

Open Settings (`Cmd/Ctrl + ,`) and search for `claudeUsage`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claudeUsage.barStyle` | string | `"gradient"` | Status bar display style: `gradient`, `blocks`, `icon-only`, `icon+gradient` |
| `claudeUsage.refreshInterval` | number | `60` | Poll interval in seconds (minimum 30) |
| `claudeUsage.warningThreshold` | number | `80` | Usage % at which the warning colour activates |
| `claudeUsage.credentialsPath` | string | `""` | Path to a custom credentials JSON file (full credentials, includes plan type) |
| `claudeUsage.viewMode` | string | `"extended"` | Sidebar view mode: `extended` (Session + Weekly cards) or `compact` (Overview only) |
| `claudeUsage.manualToken` | string | `""` | Raw OAuth token fallback (usage data only, no plan badge) |

All settings take effect immediately — no reload required.

### Bar styles

| Value | Status bar looks like |
|-------|-----------------------|
| `gradient` | `$(clock) ▰▰▰▰▰▱▱▱▱▱ Session: 45% · 2h left` |
| `blocks` | `$(clock) █████░░░░░ Session: 45% · 2h left` |
| `icon-only` | `$(pass) Session: 45% · 2h left` → `$(warning)` → `$(error)` |
| `icon+gradient` | `$(pass) ▰▰▰▰▰▱▱▱▱▱ Session: 45% · 2h left` |

## Credential Resolution

The extension tries the following sources in order and uses the first valid token found:

1. **macOS only:** system Keychain via `security find-generic-password -s "Claude Code-credentials"`.
2. `~/.claude/.credentials.json` — written automatically by Claude Code CLI (all platforms).
3. `~/.claude/credentials.json` — alternative path.
4. **Linux only:** `secret-tool lookup service "Claude Code-credentials"`.
5. **Windows only:** `%APPDATA%\claude\credentials.json`.
6. `claudeUsage.credentialsPath` setting — or run **Claude Usage: Set Credentials File Path** from the Command Palette / sidebar button. Point to any valid `credentials.json` file; provides full credentials including the plan badge.
7. `claudeUsage.manualToken` setting — or run **Claude Usage: Enter Token Manually** from the Command Palette / sidebar button. Raw token only.

> **Note — manual token limitations:** sources 1–5 provide the full credentials JSON, which includes the `subscriptionType` field used to display the plan badge (Pro, Max 5×, etc.). Source 6 is a raw token string only — the extension can fetch and display your usage data normally, but the plan badge will not appear because the subscription type is not available from the token alone and is not returned by the usage API.

The token is **never logged or written to disk** by this extension.

## Internationalization

The UI automatically follows the display language configured in VS Code. Supported languages:

| Locale | Language |
|--------|----------|
| `en` | English (default) |
| `es` | Spanish / Español |
| `it` | Italian / Italiano |
| `fr` | French / Français |

**How it works:** strings in TypeScript files use `vscode.l10n.t()`. Webview strings are pre-translated on the extension host and injected as a JSON constant. Manifest strings (command names, setting descriptions) use `package.nls.*.json` files. Translation bundles live in `l10n/bundle.l10n.{locale}.json`.

To add a new language, create `l10n/bundle.l10n.{locale}.json` (following the existing files as templates) and `package.nls.{locale}.json` for the manifest strings.

## Architecture

Source files under `src/`:

| File | Responsibility |
|------|----------------|
| `extension.ts` | Entry point — wires up `UsageStatusBar` and `UsageSidebarProvider` |
| `statusBar.ts` | Two `StatusBarItem` instances, polling interval, stale cache, config listener |
| `sidebarView.ts` | `WebviewViewProvider` — assembles the HTML panel, routes webview messages |
| `usageApi.ts` | HTTPS fetch to `api.anthropic.com/api/oauth/usage` (Node built-ins only) |
| `credentials.ts` | Cross-platform token resolution; also exports `getSubscriptionType()` |
| `skillsManager.ts` | skills.sh API search, skill installation (SKILL.md + skills-lock.json), cache |
| `usageHistory.ts` | Snapshot ring-buffer for historical usage data |
| `utils.ts` | Pure helpers: `formatTimeLeft`, `buildProgressBar`, `getColorByUsage`, `getTextColorByUsage`, `getDynamicIcon` |

Sidebar sub-modules under `src/sidebar/`:

| File | Responsibility |
|------|----------------|
| `sharedStyles.ts` | Base CSS (layout, tabs, buttons, animations) shared across all panels |
| `usageTab.ts` | Usage tab HTML, styles, and client-side script |
| `skillsTab.ts` | Skills tab HTML, styles, and client-side script |
| `types.ts` | `SidebarI18n` interface — all localizable strings for the webview |

i18n files:

| File/Folder | Purpose |
|-------------|---------|
| `package.nls.json` | English manifest strings (command titles, setting descriptions) |
| `package.nls.{locale}.json` | Translated manifest strings |
| `l10n/bundle.l10n.{locale}.json` | Runtime translation bundles for `vscode.l10n.t()` |

## Testing

Unit tests are written with [Vitest](https://vitest.dev/) and run without a VS Code instance.
The `vscode` module is replaced by a lightweight mock so tests execute in plain Node.js.

```bash
pnpm test          # run all tests once
pnpm test:watch    # watch mode during development
```

| Test file | What is covered |
|-----------|-----------------|
| `src/test/utils.test.ts` | `formatTimeLeft`, `buildProgressBar`, `getDynamicIcon`, `getColorByUsage` |
| `src/test/usageApi.test.ts` | `fetchUsage` — 200/non-200 responses, bad JSON, network errors, timeout, headers |
| `src/test/credentials.test.ts` | `getAccessToken` — file paths, JSON errors, Linux secret-tool, manual token fallback |
| `src/test/sidebarView.test.ts` | `UsageSidebarProvider` — HTML generation, message handling, i18n |

## Change Log

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

**In your feature branch:**

```bash
pnpm changeset        # choose bump type (patch/minor/major) and write a summary
git add .
git commit            # the .changeset/*.md file is committed alongside your code
```

**On merge to main:** a GitHub Action consumes the changesets, bumps `package.json`, and updates `CHANGELOG.md` via an automatic "Version Packages" PR.

## Contributing

[See CONTRIBUTING.md](./CONTRIBUTING.md)
