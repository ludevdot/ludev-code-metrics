import * as vscode from 'vscode';
import { UsageStatusBar } from './statusBar';
import { UsageSidebarProvider } from './sidebarView';
import { getAccessTokenForAccount, getActiveAccount } from './credentials';

let statusBar: UsageStatusBar | undefined;
let sidebarProvider: UsageSidebarProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new UsageStatusBar(context);
  void statusBar.start();

  sidebarProvider = new UsageSidebarProvider(context);
  sidebarProvider.onRefresh = () => { void statusBar?.refresh(); };
  sidebarProvider.onAccountChange = () => {
    statusBar?.clearCache();
    void statusBar?.refresh();
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      UsageSidebarProvider.viewType,
      sidebarProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeUsage.installSkill', () => {
      void vscode.commands.executeCommand('claudeUsage.sidebar.focus');
    })
  );

  if (!getAccessTokenForAccount(getActiveAccount(context))) {
    const enterBtn = vscode.l10n.t('Enter token manually');
    void vscode.window.showWarningMessage(
      vscode.l10n.t('Claude Code credentials not found. Set a token to see your usage data.'),
      enterBtn,
      vscode.l10n.t('Skip for now')
    ).then(selection => {
      if (selection === enterBtn) {
        void vscode.commands.executeCommand('claudeUsage.setToken');
      }
    });
  }
}

export function deactivate(): void {
  statusBar?.dispose();
  statusBar = undefined;
  sidebarProvider?.dispose();
  sidebarProvider = undefined;
}
