import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window } from './__mocks__/vscode';

// ── Module mocks (must be before the import that triggers them) ──────────────

vi.mock('../credentials', () => ({
  getAccessTokenForAccount: vi.fn(),
  getSubscriptionTypeForAccount: vi.fn().mockReturnValue(null),
  getActiveAccount: vi.fn().mockReturnValue(null),
  setActiveAccount: vi.fn().mockResolvedValue(undefined),
  getConfiguredAccounts: vi.fn().mockReturnValue([]),
  captureCliSession: vi.fn(),
  DEFAULT_ACCOUNT_LABEL: '__default__',
}));

vi.mock('../usageApi', () => ({
  fetchUsage: vi.fn(),
}));

vi.mock('../usageHistory', () => ({
  addSnapshot: vi.fn(),
  getHistory: vi.fn().mockReturnValue([]),
}));

vi.mock('../skillsManager', () => ({
  searchSkills: vi.fn(),
  loadCache: vi.fn().mockReturnValue(null),
  saveCache: vi.fn(),
  installSkill: vi.fn(),
  fetchSkillMd: vi.fn(),
}));

vi.mock('../sidebar/sharedStyles', () => ({ getSharedStyles: () => '' }));
vi.mock('../sidebar/usageTab', () => ({
  getUsageTabStyles: () => '',
  getUsageTabHtml: () => '<div id="tab-usage"></div>',
  getUsageTabScript: () => '',
}));
vi.mock('../sidebar/skillsTab', () => ({
  getSkillsTabStyles: () => '',
  getSkillsTabHtml: () => '<div id="tab-skills"></div>',
  getSkillsTabScript: () => '',
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────

import { UsageSidebarProvider } from '../sidebarView';
import * as credentials from '../credentials';
import * as usageApi from '../usageApi';

// ── Type helpers ─────────────────────────────────────────────────────────────

type PostedMsg = { type: string; [k: string]: unknown };

function postedTypes(mock: ReturnType<typeof vi.fn>): string[] {
  return (mock.mock.calls as [PostedMsg][]).map(([m]) => m.type);
}

function findPosted(mock: ReturnType<typeof vi.fn>, type: string): PostedMsg | undefined {
  return (mock.mock.calls as [PostedMsg][]).find(([m]) => m.type === type)?.[0];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal ExtensionContext stub */
function makeContext() {
  return {
    subscriptions: { push: vi.fn() },
    workspaceState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    globalState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockReturnValue([]),
      setKeysForSync: vi.fn(),
    },
  } as unknown as import('vscode').ExtensionContext;
}

/** Minimal WebviewView stub with helpers for emitting messages. */
function makeWebviewView() {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const visibilityListeners: Array<() => void> = [];

  const postMessage = vi.fn().mockResolvedValue(true);

  const webview = {
    options: {} as Record<string, unknown>,
    html: '',
    postMessage,
    onDidReceiveMessage: vi.fn((cb: (msg: unknown) => void) => {
      messageListeners.push(cb);
      return { dispose: vi.fn() };
    }),
  };

  const view = {
    webview,
    visible: true,
    badge: undefined as unknown,
    onDidChangeVisibility: vi.fn((cb: () => void) => {
      visibilityListeners.push(cb);
      return { dispose: vi.fn() };
    }),
  } as unknown as import('vscode').WebviewView;

  return {
    view,
    postMessage,
    emit: (msg: unknown) => messageListeners.forEach(cb => cb(msg)),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UsageSidebarProvider', () => {
  let provider: UsageSidebarProvider;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: getConfiguration().get returns sensible values
    workspace.getConfiguration = vi.fn().mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'barStyle') { return 'gradient'; }
        if (key === 'viewMode') { return 'extended'; }
        return '';
      }),
      update: vi.fn().mockResolvedValue(undefined),
    });

    ctx = makeContext();
    provider = new UsageSidebarProvider(ctx);
  });

  // ── resolveWebviewView ─────────────────────────────────────────────────────

  describe('resolveWebviewView', () => {
    it('enables scripts and sets html on the webview', () => {
      const { view, postMessage: _ } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      expect(view.webview.options).toMatchObject({ enableScripts: true });
      expect(view.webview.html).toBeTruthy();
    });

    it('clears badge on resolve', () => {
      const { view } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      expect(view.badge).toBeUndefined();
    });

    it('registers an onDidChangeConfiguration subscription', () => {
      const { view } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      expect(ctx.subscriptions.push).toHaveBeenCalled();
    });
  });

  // ── ready message ──────────────────────────────────────────────────────────

  describe('message: ready', () => {
    it('posts noAuth when ready is received and there is no cached data', async () => {
      const { view, emit, postMessage } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      emit({ type: 'ready' });

      await new Promise(r => setTimeout(r, 0));

      expect(postedTypes(postMessage)).toContain('noAuth');
      expect(usageApi.fetchUsage).not.toHaveBeenCalled();
    });

    it('posts stale update when ready is received and there is cached data', async () => {
      const usageData = {
        five_hour: { utilization: 10, resets_at: null },
        seven_day: { utilization: 20, resets_at: null },
        seven_day_opus: { utilization: 0, resets_at: null },
      };
      vi.mocked(credentials.getAccessTokenForAccount).mockReturnValue('tok');
      vi.mocked(usageApi.fetchUsage).mockResolvedValue(usageData);

      const { view, emit, postMessage } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);

      // Populate lastData via an explicit refresh
      await provider.refresh();
      postMessage.mockClear();

      // Now simulate reopening the panel
      emit({ type: 'ready' });
      await new Promise(r => setTimeout(r, 0));

      const updateCall = findPosted(postMessage, 'update');
      expect(updateCall).toBeDefined();
      expect(updateCall).toMatchObject({ type: 'update', stale: true });
      // No additional fetch should have been made
      expect(usageApi.fetchUsage).toHaveBeenCalledTimes(1);
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('posts noAuth when no token is available', async () => {
      vi.mocked(credentials.getAccessTokenForAccount).mockReturnValue(null);

      const { view, postMessage } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      await provider.refresh();

      expect(postedTypes(postMessage)).toContain('noAuth');
    });

    it('posts update with data on successful fetchUsage', async () => {
      const usageData = {
        five_hour: { utilization: 42, resets_at: '2026-03-04T18:00:00Z' },
        seven_day: { utilization: 30, resets_at: '2026-03-10T12:00:00Z' },
        seven_day_opus: { utilization: 5, resets_at: null },
      };
      vi.mocked(credentials.getAccessTokenForAccount).mockReturnValue('my-token');
      vi.mocked(usageApi.fetchUsage).mockResolvedValue(usageData);

      const { view, postMessage } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      await provider.refresh();

      const updateCall = findPosted(postMessage, 'update');
      expect(updateCall).toBeDefined();
      expect(updateCall).toMatchObject({ type: 'update', data: usageData, stale: false });
    });

    it('posts stale update when fetchUsage throws and lastData exists', async () => {
      const usageData = {
        five_hour: { utilization: 50, resets_at: null },
        seven_day: { utilization: 50, resets_at: null },
        seven_day_opus: { utilization: 0, resets_at: null },
      };
      vi.mocked(credentials.getAccessTokenForAccount).mockReturnValue('tok');
      vi.mocked(usageApi.fetchUsage)
        .mockResolvedValueOnce(usageData)
        .mockRejectedValueOnce(new Error('network error'));

      const { view, postMessage } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);

      // First refresh caches data
      await provider.refresh();
      postMessage.mockClear();

      // Second refresh fails → stale
      await provider.refresh();

      const updateCall = findPosted(postMessage, 'update');
      expect(updateCall).toBeDefined();
      expect(updateCall).toMatchObject({ type: 'update', stale: true });
    });

    it('invokes onRefresh callback after a successful fetch', async () => {
      vi.mocked(credentials.getAccessTokenForAccount).mockReturnValue('tok');
      vi.mocked(usageApi.fetchUsage).mockResolvedValue({
        five_hour: { utilization: 0, resets_at: null },
        seven_day: { utilization: 0, resets_at: null },
        seven_day_opus: { utilization: 0, resets_at: null },
      });

      const { view } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);

      const onRefresh = vi.fn();
      provider.onRefresh = onRefresh;
      await provider.refresh();

      expect(onRefresh).toHaveBeenCalledOnce();
    });
  });

  // ── message: refresh ───────────────────────────────────────────────────────

  describe('message: refresh', () => {
    it('triggers a data fetch when the webview sends refresh', async () => {
      vi.mocked(credentials.getAccessTokenForAccount).mockReturnValue('tok');
      vi.mocked(usageApi.fetchUsage).mockResolvedValue({
        five_hour: { utilization: 10, resets_at: null },
        seven_day: { utilization: 10, resets_at: null },
        seven_day_opus: { utilization: 0, resets_at: null },
      });

      const { view, emit, postMessage } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      emit({ type: 'refresh' });

      await new Promise(r => setTimeout(r, 0));
      expect(postedTypes(postMessage)).toContain('update');
    });
  });

  // ── message: setToken ──────────────────────────────────────────────────────

  describe('message: setToken', () => {
    it('opens an input box and saves the token to configuration', async () => {
      const updateFn = vi.fn().mockResolvedValue(undefined);
      workspace.getConfiguration = vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(''),
        update: updateFn,
      });
      window.showInputBox = vi.fn().mockResolvedValue('my-secret-token');

      const { view, emit } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      emit({ type: 'setToken' });

      await new Promise(r => setTimeout(r, 0));

      expect(window.showInputBox).toHaveBeenCalledOnce();
      expect(updateFn).toHaveBeenCalledWith('manualToken', 'my-secret-token', 1 /* ConfigurationTarget.Global */);
    });

    it('does not save when the user cancels the input box', async () => {
      const updateFn = vi.fn().mockResolvedValue(undefined);
      workspace.getConfiguration = vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(''),
        update: updateFn,
      });
      window.showInputBox = vi.fn().mockResolvedValue(undefined); // user cancelled

      const { view, emit } = makeWebviewView();
      provider.resolveWebviewView(view, {} as import('vscode').WebviewViewResolveContext, {} as import('vscode').CancellationToken);
      emit({ type: 'setToken' });

      await new Promise(r => setTimeout(r, 0));

      expect(updateFn).not.toHaveBeenCalledWith('manualToken', expect.anything(), expect.anything());
    });
  });
});
