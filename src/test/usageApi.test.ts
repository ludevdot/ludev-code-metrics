import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as https from 'https';
import { EventEmitter } from 'events';
import { fetchUsage, UsageLimits } from '../usageApi';

vi.mock('https');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate a successful HTTPS response with the given status and body. */
function setupMockResponse(statusCode: number, body: string) {
  vi.mocked(https.request).mockImplementation(((_url: unknown, _opts: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
    const mockReq = Object.assign(new EventEmitter(), {
      setTimeout: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    });

    const mockRes = Object.assign(new EventEmitter(), { statusCode });

    // Deliver the response on the next tick so the Promise has time to set up.
    process.nextTick(() => {
      callback(mockRes);
      mockRes.emit('data', body);
      mockRes.emit('end');
    });

    return mockReq as unknown as ReturnType<typeof https.request>;
  }) as typeof https.request);
}

/** Build a minimal valid UsageLimits JSON body. */
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
    setupMockResponse(200, JSON.stringify(validBody));
    const result = await fetchUsage('test-token');
    expect(result).toEqual(validBody);
  });

  it('rejects with an HTTP error for non-200 status codes', async () => {
    setupMockResponse(401, '{"error":"Unauthorized"}');
    await expect(fetchUsage('bad-token')).rejects.toThrow('API returned HTTP 401');
  });

  it('rejects when the response body is not valid JSON', async () => {
    setupMockResponse(200, 'not-json');
    await expect(fetchUsage('token')).rejects.toThrow('Failed to parse API response');
  });

  it('rejects when the request emits a network error', async () => {
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

    await expect(fetchUsage('token')).rejects.toThrow('ECONNREFUSED');
  });

  it('rejects on timeout via req.destroy', async () => {
    vi.mocked(https.request).mockImplementation(((_url: unknown, _opts: unknown, _callback: unknown) => {
      const mockReq = Object.assign(new EventEmitter(), {
        // Immediately invoke the timeout callback so we don't wait 10 s in tests.
        setTimeout: vi.fn().mockImplementation((_ms: number, cb: () => void) => { cb(); }),
        end: vi.fn(),
        destroy: vi.fn().mockImplementation((err: Error) => { mockReq.emit('error', err); }),
      });
      return mockReq as unknown as ReturnType<typeof https.request>;
    }) as typeof https.request);

    await expect(fetchUsage('token')).rejects.toThrow('Request timed out');
  });

  it('sends the correct Authorization header', async () => {
    setupMockResponse(200, JSON.stringify(validBody));
    await fetchUsage('my-secret-token');

    const [[, options]] = vi.mocked(https.request).mock.calls;
    const headers = (options as { headers: Record<string, string> }).headers;
    expect(headers['Authorization']).toBe('Bearer my-secret-token');
    expect(headers['anthropic-beta']).toBe('oauth-2025-04-20');
  });
});
