import * as vscode from 'vscode';

const KEY = 'ludevMetrics.history';
const MAX_POINTS = 48;
const TTL_MS = 48 * 60 * 60 * 1000;

interface UsageSnapshot {
  ts: number;
  session: number;
  weekly: number;
}

export function addSnapshot(context: vscode.ExtensionContext, session: number, weekly: number): void {
  const now = Date.now();
  const snapshots = getRawSnapshots(context).filter(s => now - s.ts < TTL_MS);
  snapshots.push({ ts: now, session, weekly });
  if (snapshots.length > MAX_POINTS) { snapshots.splice(0, snapshots.length - MAX_POINTS); }
  void context.globalState.update(KEY, snapshots);
}

export function getHistory(context: vscode.ExtensionContext): { session: number[]; weekly: number[] } {
  const now = Date.now();
  const valid = getRawSnapshots(context).filter(s => now - s.ts < TTL_MS).slice(-24);
  return {
    session: valid.map(s => s.session),
    weekly: valid.map(s => s.weekly),
  };
}

function getRawSnapshots(context: vscode.ExtensionContext): UsageSnapshot[] {
  return context.globalState.get<UsageSnapshot[]>(KEY, []);
}
