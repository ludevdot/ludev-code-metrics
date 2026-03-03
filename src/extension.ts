import * as vscode from 'vscode';
import { UsageStatusBar } from './statusBar';
import { UsageSidebarProvider } from './sidebarView';

let statusBar: UsageStatusBar | undefined;
let sidebarProvider: UsageSidebarProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new UsageStatusBar(context);
  void statusBar.start();

  sidebarProvider = new UsageSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      UsageSidebarProvider.viewType,
      sidebarProvider
    )
  );
}

export function deactivate(): void {
  statusBar?.dispose();
  statusBar = undefined;
  sidebarProvider?.dispose();
  sidebarProvider = undefined;
}
