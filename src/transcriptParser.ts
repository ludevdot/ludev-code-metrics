import * as fs from 'fs';
import * as readline from 'readline';
import type { TranscriptMetrics } from './sidebar/types';

/**
 * Per-model token accumulator used during parsing.
 * Maps model name to its aggregated token counts.
 */
export interface ModelTokenMap {
  [model: string]: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

export interface TranscriptParseResult {
  metrics: TranscriptMetrics;
  modelTokens: ModelTokenMap;
}

interface TranscriptEntry {
  type?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  timestamp?: string;
}

/**
 * Returns empty metrics as the baseline / fallback.
 */
function emptyResult(): TranscriptParseResult {
  return {
    metrics: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      responseCount: 0,
      firstResponseAt: null,
      lastResponseAt: null,
    },
    modelTokens: {},
  };
}

/**
 * Parses a Claude Code JSONL transcript file using streaming readline.
 * Only processes entries where `type === "assistant"` and `message.usage` exists.
 * Malformed lines are silently skipped. Missing or empty files return zero metrics.
 *
 * This function never loads the full file into memory, making it safe for large
 * transcripts (100MB+).
 */
export async function parseTranscript(filePath: string): Promise<TranscriptParseResult> {
  if (!fs.existsSync(filePath)) {
    return emptyResult();
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return emptyResult();
  }

  const result = emptyResult();
  const { metrics, modelTokens } = result;

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) { continue; }

    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line) as TranscriptEntry;
    } catch {
      // Skip malformed lines
      continue;
    }

    if (entry.type !== 'assistant') { continue; }

    const usage = entry.message?.usage;
    if (!usage) { continue; }

    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;

    metrics.inputTokens += input;
    metrics.outputTokens += output;
    metrics.cacheReadTokens += cacheRead;
    metrics.cacheCreationTokens += cacheCreation;
    metrics.responseCount += 1;

    // Track timestamp for session duration
    if (entry.timestamp) {
      const ts = new Date(entry.timestamp);
      if (!isNaN(ts.getTime())) {
        if (!metrics.firstResponseAt || ts < metrics.firstResponseAt) {
          metrics.firstResponseAt = ts;
        }
        if (!metrics.lastResponseAt || ts > metrics.lastResponseAt) {
          metrics.lastResponseAt = ts;
        }
      }
    }

    // Track per-model tokens
    const model = entry.message?.model ?? 'unknown';
    if (!modelTokens[model]) {
      modelTokens[model] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    }
    modelTokens[model].inputTokens += input;
    modelTokens[model].outputTokens += output;
    modelTokens[model].cacheReadTokens += cacheRead;
    modelTokens[model].cacheCreationTokens += cacheCreation;
  }

  return result;
}
