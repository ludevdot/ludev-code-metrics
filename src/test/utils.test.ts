import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatTimeLeft,
  getColorByUsage,
} from '../utils';
import { ThemeColor } from './__mocks__/vscode';

// ---------------------------------------------------------------------------
// formatTimeLeft
// ---------------------------------------------------------------------------

describe('formatTimeLeft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T12:00:00Z'));
  });

  it('returns empty string for null', () => {
    expect(formatTimeLeft(null)).toBe('');
  });

  it('returns empty string for a past date', () => {
    expect(formatTimeLeft('2026-03-03T11:59:59Z')).toBe('');
  });

  it('returns minutes for < 1 hour remaining', () => {
    expect(formatTimeLeft('2026-03-03T12:45:00Z')).toBe('45m left');
  });

  it('returns hours for 1–23 hours remaining', () => {
    expect(formatTimeLeft('2026-03-03T14:30:00Z')).toBe('2h left');
  });

  it('returns days for >= 24 hours remaining', () => {
    expect(formatTimeLeft('2026-03-05T12:00:00Z')).toBe('2d left');
  });

  it('returns 1m left for exactly 1 minute remaining', () => {
    expect(formatTimeLeft('2026-03-03T12:01:00Z')).toBe('1m left');
  });
});

// ---------------------------------------------------------------------------
// getColorByUsage
// ---------------------------------------------------------------------------

describe('getColorByUsage', () => {
  it('returns undefined below warning threshold', () => {
    expect(getColorByUsage(0, 80)).toBeUndefined();
    expect(getColorByUsage(79, 80)).toBeUndefined();
  });

  it('returns warning ThemeColor at warning threshold', () => {
    const color = getColorByUsage(80, 80);
    expect(color).toBeInstanceOf(ThemeColor);
    expect((color as ThemeColor).id).toBe('statusBarItem.warningBackground');
  });

  it('returns error ThemeColor at or above 95%', () => {
    const color = getColorByUsage(95, 80);
    expect(color).toBeInstanceOf(ThemeColor);
    expect((color as ThemeColor).id).toBe('statusBarItem.errorBackground');
  });

  it('returns error ThemeColor at 100%', () => {
    const color = getColorByUsage(100, 50);
    expect(color).toBeInstanceOf(ThemeColor);
    expect((color as ThemeColor).id).toBe('statusBarItem.errorBackground');
  });
});
