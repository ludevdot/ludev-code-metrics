import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatTimeLeft,
  buildProgressBar,
  getDynamicIcon,
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
// buildProgressBar
// ---------------------------------------------------------------------------

describe('buildProgressBar', () => {
  it('returns all empty chars at 0%', () => {
    expect(buildProgressBar(0, 10, 'gradient')).toBe('▱▱▱▱▱▱▱▱▱▱');
    expect(buildProgressBar(0, 10, 'blocks')).toBe('░░░░░░░░░░');
  });

  it('returns all filled chars at 100%', () => {
    expect(buildProgressBar(100, 10, 'gradient')).toBe('▰▰▰▰▰▰▰▰▰▰');
    expect(buildProgressBar(100, 10, 'blocks')).toBe('██████████');
  });

  it('returns half filled at 50%', () => {
    expect(buildProgressBar(50, 10, 'gradient')).toBe('▰▰▰▰▰▱▱▱▱▱');
    expect(buildProgressBar(50, 10, 'blocks')).toBe('█████░░░░░');
  });

  it('clamps negative percentages to 0', () => {
    expect(buildProgressBar(-10, 10, 'gradient')).toBe('▱▱▱▱▱▱▱▱▱▱');
  });

  it('clamps percentages above 100 to full bar', () => {
    expect(buildProgressBar(150, 10, 'gradient')).toBe('▰▰▰▰▰▰▰▰▰▰');
  });

  it('respects custom length', () => {
    expect(buildProgressBar(50, 4, 'gradient')).toBe('▰▰▱▱');
  });
});

// ---------------------------------------------------------------------------
// getDynamicIcon
// ---------------------------------------------------------------------------

describe('getDynamicIcon', () => {
  it('returns $(pass) below warning threshold', () => {
    expect(getDynamicIcon(0, 80)).toBe('$(pass)');
    expect(getDynamicIcon(79, 80)).toBe('$(pass)');
  });

  it('returns $(warning) at or above warning threshold', () => {
    expect(getDynamicIcon(80, 80)).toBe('$(warning)');
    expect(getDynamicIcon(94, 80)).toBe('$(warning)');
  });

  it('returns $(error) at or above 95%', () => {
    expect(getDynamicIcon(95, 80)).toBe('$(error)');
    expect(getDynamicIcon(100, 80)).toBe('$(error)');
  });

  it('respects custom warning threshold', () => {
    expect(getDynamicIcon(60, 50)).toBe('$(warning)');
    expect(getDynamicIcon(49, 50)).toBe('$(pass)');
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
