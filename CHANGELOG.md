# Change Log

All notable changes to the **Ludev Code Metrics** extension will be documented in this file.

Follow [Keep a Changelog](http://keepachangelog.com/) conventions.

## [1.1.12] - 2026-03-13

### Added
- **Auto-refresh toggle** in the sidebar header — enable periodic background refresh with a configurable interval (1–60 minutes, default 5).
- When auto-refresh is enabled, the manual refresh button is hidden and a rate-limit warning hint is shown below the header.
- New settings: `ludevMetrics.autoRefresh` (boolean, default `false`) and `ludevMetrics.autoRefreshInterval` (number, default `5` minutes).

### Changed
- Sidebar header no longer shows the "Ludev Code Metrics" title — replaced by the auto-refresh toggle and plan badge.

## [1.1.11] - 2026-03-10

### Fixed
- Corrected repo name in `.changeset/config.json` (was `ludev/claude-usage-indicator`).

## [1.1.10] - 2026-03-10

### Added
- Extension marketplace icon updated to `media/ludev-logo.png`.
- CHANGELOG fully rewritten to cover all releases since the rename to Ludev Code Metrics.

## [1.1.9] - 2026-03-10

### Added
- GitHub issue templates for bug reports and feature requests.
- README: MIT license badge and updated marketplace logo.

## [1.1.8] - 2026-03-09

### Added
- Repository links and CODEOWNERS file for PR review assignment.

## [1.1.5] - 2026-03-09

### Added
- VS Code Marketplace metadata: gallery banner, keywords, and screenshots.

## [1.1.4] - 2026-03-09

### Changed
- Extension display name updated to **Ludev Code Metrics**.
- Updated media assets and logo.

## [1.1.3] - 2026-03-09

### Changed
- All command IDs, config keys, and view IDs renamed from `claudeUsage.*` to `ludevMetrics.*`.
- Fixed extension icon path to `media/logo.png`.

## [1.0.3] - 2026-03-09

### Added
- Skills list: per-item action buttons (install, preview) directly in the list.
- Persistent tab selection — active tab (Usage / Skills) is remembered across VS Code restarts.
- Scrollable skills list for long result sets.
- New extension logo.

### Changed
- Status bar text is now **green** when usage is below the warning threshold.

## [1.0.0] - 2026-03-04

### Added
- Skills tab loads automatically when opened (no extra click required).

### Changed
- Removed multi-account dropdown from the sidebar header to simplify the UI.
- Fixed refresh animation glitch on the sidebar panel.

## [0.0.18] - 2026-03-04

### Changed
- Replaced the refresh icon button with a labeled **Refresh** text button for clarity.

## [0.0.17] - 2026-03-04

### Added
- Unit tests for `UsageSidebarProvider`.

## [0.0.16] - 2026-03-04

### Added
- Toast notification when usage crosses the warning threshold mid-session.

## [0.0.14] - 2026-03-04

### Fixed
- Removed persistent sidebar badge that was showing stale counts.
- Cached data is now shown correctly when the webview reloads.

## [0.0.13] - 2026-03-04

### Added
- Loading pulse animation while a refresh is in progress.

## [0.0.12] - 2026-03-04

### Added
- Usage history **sparkline** in each sidebar card to visualize consumption over time.

## [0.0.11] - 2026-03-04

### Changed
- Improved account UX: empty state messaging, CLI login terminal integration, no duplicate toast notifications.

## [0.0.10] - 2026-03-04

### Changed
- Removed manual token input flow. Credentials are now captured automatically from the Claude Code CLI session.

## [0.0.9] - 2026-03-04

### Added
- Account management: rename and delete saved accounts from the sidebar.

### Fixed
- Cached usage data is now cleared when switching accounts to prevent stale display.

## [0.0.8] - 2026-03-04

### Changed
- Sidebar code split into modular files for easier maintenance.

## [0.0.6] - 2026-03-04

### Changed
- Updated extension icon to the new `logo.png`.

## [0.0.5] - 2026-03-04

### Added
- **Usage / Skills tab bar** in the sidebar panel to switch between usage metrics and the skills browser.

## [0.0.4] - 2026-03-04

### Fixed
- Card color state (warning / error) now preserved correctly when the card updates.

## [0.0.3] - 2026-03-04

### Added
- **Skills browser**: search for installable Claude Code skills from the sidebar.
- **Skill preview panel**: view SKILL.md details before installing.
- **Install skill command** (`ludevMetrics.installSkill`): downloads `SKILL.md` from GitHub and writes it to `.claude/skills/`, updating `skills-lock.json`.
- Skills results cache with 24-hour TTL to reduce API calls.

### Fixed
- Removed automatic polling — the sidebar now only refreshes on manual click to avoid rate-limiting.
- View mode (extended / compact) applied on initial render to avoid layout flash.

## [0.0.1] - 2026-03-03

### Added
- **Status Bar items** — two items on the right side showing session (5 h rolling) and weekly (7 d rolling) usage from the Claude Code API.
- **Four bar styles** switchable via `ludevMetrics.barStyle`:
  - `gradient` — `▰▰▰▰▰▱▱▱▱▱` using filled/unfilled block characters.
  - `blocks` — `█████░░░░░` using solid/empty block characters.
  - `icon-only` — dynamic codicon (`$(pass)` → `$(warning)` → `$(error)`) with no bar.
  - `icon+gradient` — dynamic codicon combined with gradient bar.
- **Dynamic colors** — warning background at ≥ `warningThreshold`% (default 80%), error background at ≥ 95%.
- **Stale indicator** (`~`) — shown when the last fetch failed but cached data is available.
- **Click to refresh** — clicking either status bar item triggers an immediate data fetch.
- **Sidebar panel** — Activity Bar icon opens a `WebviewView` panel with:
  - SVG circular progress rings per usage window.
  - Linear progress bar beneath each ring.
  - Reset countdown ("2 h left", "3 d left", etc.).
  - Stale badge when data is cached.
  - Animated refresh button.
  - Style picker with radio buttons to switch `barStyle` live.
  - Last-updated timestamp in the footer.
- **Cross-platform credential resolution** in order:
  1. `~/.claude/.credentials.json` (Claude Code CLI default).
  2. `~/.claude/credentials.json` fallback.
  3. Linux: `secret-tool lookup service "Claude Code-credentials"`.
  4. Windows: `%APPDATA%\claude\credentials.json`.
  5. `ludevMetrics.manualToken` VS Code setting.
- **Configuration** via `contributes.configuration`:
  - `ludevMetrics.barStyle` (default `"gradient"`)
  - `ludevMetrics.refreshInterval` (default `60` s, min `30` s)
  - `ludevMetrics.warningThreshold` (default `80`%)
  - `ludevMetrics.manualToken` (default `""`)
- **Live config reload** — settings changes restart polling and re-render immediately, no reload required.
