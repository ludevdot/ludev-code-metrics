# Change Log

All notable changes to the "claude-usage-indicator" extension will be documented in this file.

Follow [Keep a Changelog](http://keepachangelog.com/) conventions.

## [Unreleased]

## [0.0.1] - 2026-03-03

### Added

- **Status Bar items** — two items on the right side of the Status Bar showing
  session (5h rolling window) and weekly (7d rolling window) utilization from
  the Claude Code API.
- **Four bar styles** switchable via `claudeUsage.barStyle`:
  - `gradient` — `▰▰▰▰▰▱▱▱▱▱` using filled/unfilled block characters.
  - `blocks` — `█████░░░░░` using solid/empty block characters.
  - `icon-only` — dynamic codicon (`$(pass)` → `$(warning)` → `$(error)`) with no bar.
  - `icon+gradient` — dynamic codicon combined with gradient bar.
- **Dynamic colors** — `statusBarItem.warningBackground` at ≥ `warningThreshold`%
  (default 80), `statusBarItem.errorBackground` at ≥ 95%.
- **Stale indicator** (`~`) — shown when the last API fetch failed but cached data
  is available, so the display never goes blank unexpectedly.
- **Click to refresh** — clicking either status bar item triggers an immediate fetch.
- **Sidebar panel** — Activity Bar icon opens a `WebviewView` panel with:
  - SVG circular progress rings per usage window.
  - Linear progress bar beneath each ring.
  - Reset countdown ("2h left", "3d left", etc.).
  - Stale badge when data is cached.
  - Animated refresh button (⟳).
  - Style picker with four radio buttons to switch `barStyle` live.
  - Last-updated timestamp in the footer.
- **Cross-platform credential resolution** in order:
  1. `~/.claude/.credentials.json` (Claude Code CLI writes this on all platforms).
  2. `~/.claude/credentials.json` fallback.
  3. Linux: `secret-tool lookup service "Claude Code-credentials"`.
  4. Windows: `%APPDATA%\claude\credentials.json`.
  5. `claudeUsage.manualToken` VSCode setting.
- **Configuration** via `contributes.configuration`:
  - `claudeUsage.barStyle` (default `"gradient"`)
  - `claudeUsage.refreshInterval` (default `60`s, min `30`s)
  - `claudeUsage.warningThreshold` (default `80`%)
  - `claudeUsage.manualToken` (default `""`)
- **Live config reload** — `onDidChangeConfiguration` listener restarts polling
  and re-renders immediately on any setting change, no reload required.
