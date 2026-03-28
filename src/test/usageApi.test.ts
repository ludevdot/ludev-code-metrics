import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as https from 'https';
import { EventEmitter } from 'events';
import { fetchUsage, UsageLimits, RateLimitError } from '../usageApi';

vi.mock('https');

const FAST_RETRY = { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockResponseOptions {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

function setupMockResponse(...responses: MockResponseOptions[]) {
  let callIndex = 0;
  vi.mocked(https.request).mockImplementation(((_url: unknown, _opts: unknown, callback: (res: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void) => {
    const mockReq = Object.assign(new EventEmitter(), {
      setTimeout: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    });

    const resp = responses[Math.min(callIndex++, responses.length - 1)];
    const mockRes = Object.assign(new EventEmitter(), {
      statusCode: resp.statusCode,
      headers: resp.headers ?? {},
    });

    process.nextTick(() => {
      callback(mockRes);
      mockRes.emit('data', resp.body);
      mockRes.emit('end');
    });

    return mockReq as unknown as ReturnType<typeof https.request>;
  }) as typeof https.request);
}

const validBody: UsageLimits = {
  five_hour:      { utilization: 45, resets_at: '2026-03-03T14:00:00Z' },
  seven_day:      { utilization: 26, resets_at: '2026-03-09T12:00:00Z' },
  seven_day_opus: { utilization: 0,  resets_at: null },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves with parsed data on a 200 response', async () => {
    setupMockResponse({ statusCode: 200, body: JSON.stringify(validBody) });
    const result = await fetchUsage('test-token');
    expect(result).toEqual(validBody);
  });

  it('rejects with an HTTP error for non-200 non-retryable status codes', async () => {
    setupMockResponse({ statusCode: 401, body: '{"error":"Unauthorized"}' });
    await expect(fetchUsage('bad-token', FAST_RETRY)).rejects.toThrow('API returned HTTP 401');
  });

  it('rejects when the response body is not valid JSON', async () => {
    setupMockResponse({ statusCode: 200, body: 'not-json' });
    await expect(fetchUsage('token')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('rejects when the request emits a network error after retries', async () => {
    vi.mocked(https.request).mockImplementation(((_url: unknown, _opts: unknown, _callback: unknown) => {
      const mockReq = Object.assign(new EventEmitter(), {
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      });
      process.nextTick(() => {
        mockReq.emit('error', new Error('ECONNREFUSED'));
      });
      return mockReq as unknown as ReturnType<typeof https.request>;
    }) as typeof https.request);

    await expect(fetchUsage('token', FAST_RETRY)).rejects.toThrow('ECONNREFUSED');
  });

  it('rejects on timeout via req.destroy', async () => {
    vi.mocked(https.request).mockImplementation(((_url: unknown, _opts: unknown, _callback: unknown) => {
      const mockReq = Object.assign(new EventEmitter(), {
        setTimeout: vi.fn().mockImplementation((_ms: number, cb: () => void) => { cb(); }),
        end: vi.fn(),
        destroy: vi.fn().mockImplementation((err: Error) => { mockReq.emit('error', err); }),
      });
      return mockReq as unknown as ReturnType<typeof https.request>;
    }) as typeof https.request);

    await expect(fetchUsage('token', FAST_RETRY)).rejects.toThrow('Request timed out');
  });

  it('sends the correct Authorization header', async () => {
    setupMockResponse({ statusCode: 200, body: JSON.stringify(validBody) });
    await fetchUsage('my-secret-token');

    const [[, options]] = vi.mocked(https.request).mock.calls;
    const headers = (options as { headers: Record<string, string> }).headers;
    expect(headers['Authorization']).toBe('Bearer my-secret-token');
    expect(headers['anthropic-beta']).toBe('oauth-2025-04-20');
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    setupMockResponse(
      { statusCode: 429, body: '', headers: { 'retry-after': '0' } },
      { statusCode: 200, body: JSON.stringify(validBody) },
    );
    const result = await fetchUsage('token', FAST_RETRY);
    expect(result).toEqual(validBody);
    expect(vi.mocked(https.request)).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after exhausting retries on 429', async () => {
    setupMockResponse(
      { statusCode: 429, body: '', headers: {} },
    );
    await expect(fetchUsage('token', FAST_RETRY)).rejects.toBeInstanceOf(RateLimitError);
  });

  it('retries on 500 and succeeds on next attempt', async () => {
    setupMockResponse(
      { statusCode: 500, body: '' },
      { statusCode: 200, body: JSON.stringify(validBody) },
    );
    const result = await fetchUsage('token', FAST_RETRY);
    expect(result).toEqual(validBody);
    expect(vi.mocked(https.request)).toHaveBeenCalledTimes(2);
  });

  it('respects retry-after header value', async () => {
    setupMockResponse(
      { statusCode: 429, body: '', headers: { 'retry-after': '1' } },
      { statusCode: 200, body: JSON.stringify(validBody) },
    );
    const result = await fetchUsage('token', FAST_RETRY);
    expect(result).toEqual(validBody);
  });
});
