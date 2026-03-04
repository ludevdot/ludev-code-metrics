/**
 * Minimal VS Code API mock.
 * Imported instead of the real 'vscode' module during unit tests (see vitest.config.ts).
 */
import { vi } from 'vitest';

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class MarkdownString {
  public isTrusted = false;
  constructor(public value: string = '') {}
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;

// Configurable config mock — reset per test with vi.clearAllMocks()
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue(''),
    update: vi.fn(),
  }),
  onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  workspaceFolders: undefined as undefined | { uri: { fsPath: string } }[],
};

export const window = {
  createStatusBarItem: vi.fn().mockReturnValue({
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    text: '',
    tooltip: '',
    backgroundColor: undefined,
    command: '',
  }),
  showInputBox: vi.fn(),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showOpenDialog: vi.fn(),
  createTerminal: vi.fn().mockReturnValue({ show: vi.fn(), dispose: vi.fn() }),
  onDidCloseTerminal: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

export const commands = {
  registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

export const l10n = {
  t: (str: string, ...args: unknown[]): string =>
    str.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')),
};
