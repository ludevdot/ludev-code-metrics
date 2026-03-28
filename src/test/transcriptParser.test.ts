import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseTranscript } from '../transcriptParser';

let tmpDir: string;

function tmpFile(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeAssistantLine(
  inputTokens: number,
  outputTokens: number,
  opts?: {
    cacheRead?: number;
    cacheCreation?: number;
    model?: string;
    timestamp?: string;
  },
): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: opts?.timestamp ?? '2026-03-28T10:00:00Z',
    message: {
      model: opts?.model ?? 'claude-sonnet-4-20250514',
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: opts?.cacheRead ?? 0,
        cache_creation_input_tokens: opts?.cacheCreation ?? 0,
      },
    },
  });
}

describe('parseTranscript', () => {
  it('parses a valid transcript with multiple entries', async () => {
    const content = [
      makeAssistantLine(1000, 500, { cacheRead: 200, cacheCreation: 100 }),
      makeAssistantLine(2000, 800, { cacheRead: 300, cacheCreation: 50 }),
      JSON.stringify({ type: 'human', message: { content: 'hello' } }),
      makeAssistantLine(500, 200),
    ].join('\n');

    const filePath = tmpFile('valid.jsonl', content);
    const result = await parseTranscript(filePath);

    expect(result.metrics.inputTokens).toBe(3500);
    expect(result.metrics.outputTokens).toBe(1500);
    expect(result.metrics.cacheReadTokens).toBe(500);
    expect(result.metrics.cacheCreationTokens).toBe(150);
    expect(result.metrics.responseCount).toBe(3);
  });

  it('returns zero metrics for an empty file', async () => {
    const filePath = tmpFile('empty.jsonl', '');
    const result = await parseTranscript(filePath);

    expect(result.metrics.inputTokens).toBe(0);
    expect(result.metrics.outputTokens).toBe(0);
    expect(result.metrics.responseCount).toBe(0);
  });

  it('returns zero metrics for a missing file', async () => {
    const result = await parseTranscript('/nonexistent/path/file.jsonl');

    expect(result.metrics.inputTokens).toBe(0);
    expect(result.metrics.responseCount).toBe(0);
  });

  it('skips malformed lines gracefully', async () => {
    const content = [
      makeAssistantLine(1000, 500),
      'this is not json',
      '{"broken": true',
      makeAssistantLine(2000, 300),
    ].join('\n');

    const filePath = tmpFile('malformed.jsonl', content);
    const result = await parseTranscript(filePath);

    expect(result.metrics.inputTokens).toBe(3000);
    expect(result.metrics.outputTokens).toBe(800);
    expect(result.metrics.responseCount).toBe(2);
  });

  it('tracks per-model tokens', async () => {
    const content = [
      makeAssistantLine(1000, 500, { model: 'claude-sonnet-4-20250514' }),
      makeAssistantLine(2000, 1000, { model: 'claude-opus-4-20250514' }),
      makeAssistantLine(500, 200, { model: 'claude-sonnet-4-20250514' }),
    ].join('\n');

    const filePath = tmpFile('multi-model.jsonl', content);
    const result = await parseTranscript(filePath);

    expect(result.modelTokens['claude-sonnet-4-20250514'].inputTokens).toBe(1500);
    expect(result.modelTokens['claude-opus-4-20250514'].inputTokens).toBe(2000);
    expect(result.metrics.responseCount).toBe(3);
  });

  it('tracks timestamps for session duration', async () => {
    const content = [
      makeAssistantLine(100, 50, { timestamp: '2026-03-28T10:00:00Z' }),
      makeAssistantLine(100, 50, { timestamp: '2026-03-28T10:30:00Z' }),
      makeAssistantLine(100, 50, { timestamp: '2026-03-28T11:00:00Z' }),
    ].join('\n');

    const filePath = tmpFile('timestamps.jsonl', content);
    const result = await parseTranscript(filePath);

    expect(result.metrics.firstResponseAt).toEqual(new Date('2026-03-28T10:00:00Z'));
    expect(result.metrics.lastResponseAt).toEqual(new Date('2026-03-28T11:00:00Z'));
  });

  it('ignores non-assistant entries', async () => {
    const content = [
      JSON.stringify({ type: 'human', message: { content: 'hello' } }),
      JSON.stringify({ type: 'system', message: { content: 'init' } }),
      makeAssistantLine(500, 200),
    ].join('\n');

    const filePath = tmpFile('mixed.jsonl', content);
    const result = await parseTranscript(filePath);

    expect(result.metrics.inputTokens).toBe(500);
    expect(result.metrics.responseCount).toBe(1);
  });

  it('handles assistant entries without usage field', async () => {
    const content = [
      JSON.stringify({ type: 'assistant', message: { model: 'test' } }),
      makeAssistantLine(500, 200),
    ].join('\n');

    const filePath = tmpFile('no-usage.jsonl', content);
    const result = await parseTranscript(filePath);

    expect(result.metrics.inputTokens).toBe(500);
    expect(result.metrics.responseCount).toBe(1);
  });
});
