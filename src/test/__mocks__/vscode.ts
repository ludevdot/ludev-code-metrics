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
export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue(''),
    update: vi.fn(),
  }),
  onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
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
};

export const commands = {
  registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};
