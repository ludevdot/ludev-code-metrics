export interface SidebarI18n {
  yourAccount: string;
  plan: string;
  title: string;
  refresh: string;
  session: string;
  session5h: string;
  weekly: string;
  weekly7d: string;
  stale: string;
  used: string;
  noResetTime: string;
  notAuth: string;
  notAuthHint: string;
  setTokenBtn: string;
  tokenOnlyDesc: string;
  setCredPathBtn: string;
  credPathDesc: string;
  selectCredFile: string;
  updated: string;
  dLeft: string;
  hLeft: string;
  mLeft: string;
  overview: string;
  tabUsage: string;
  skillsLabel: string;
  skillsSearch: string;
  skillsEmpty: string;
  skillsNoResults: string;
  skillsRefine: string;
  skillsInstalls: string;
  skillsInstall: string;
  skillsInstalling: string;
  skillsViewOnSkillsSh: string;
  skillsInstalled: string;
  skillsInstallOk: string;
  skillsInstallErr: string;
  sessionLabel: string;
  weeklyLabel: string;
  opusLabel: string;
  accountCapture: string;
  refreshCooldown: string;
  autoRefreshLabel: string;
  autoRefreshEnable: string;
  autoRefreshEvery: string;
  autoRefreshMinutes: string;
  autoRefreshHint: string;
  // Context tab
  ctxLabel: string;
  ctxNoSession: string;
  ctxSessionLabel: string;
  ctxTokenBreakdown: string;
  ctxInput: string;
  ctxOutput: string;
  ctxCacheRead: string;
  ctxCacheWrite: string;
  ctxSummary: string;
  ctxCostLabel: string;
  ctxResponses: string;
  ctxDuration: string;
  ctxTotalTokens: string;
  ctxModels: string;
}

/** Information about an active Claude Code session. */
export interface SessionInfo {
  pid: number;
  sessionId: string;
  projectPath: string;
  transcriptPath: string;
  startedAt: Date;
}

/** Aggregated token metrics from a parsed transcript. */
export interface TranscriptMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  responseCount: number;
  firstResponseAt: Date | null;
  lastResponseAt: Date | null;
}

/** Breakdown of estimated cost by token category. */
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheCreationCost: number;
  totalCost: number;
}

/** Per-million-token pricing rates. */
export interface CostRates {
  inputPerMtok: number;
  outputPerMtok: number;
  cacheReadPerMtok: number;
  cacheCreationPerMtok: number;
}
