import * as vscode from 'vscode';
import { UsageStatusBar } from './statusBar';

let statusBar: UsageStatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new UsageStatusBar(context);
  void statusBar.start();
}

export function deactivate(): void {
  statusBar?.dispose();
  statusBar = undefined;
}
