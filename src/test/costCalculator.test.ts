import { describe, it, expect } from 'vitest';
import { calculateCost, calculateCostByModel, DEFAULT_COST_RATES } from '../costCalculator';
import type { ModelTokenMap } from '../transcriptParser';

describe('calculateCost', () => {
  it('calculates standard pricing correctly', () => {
    const result = calculateCost(10_000, 5_000, 0, 0, DEFAULT_COST_RATES);

    // input: 10000 / 1M * 3.00 = 0.03
    // output: 5000 / 1M * 15.00 = 0.075
    expect(result.inputCost).toBeCloseTo(0.03, 6);
    expect(result.outputCost).toBeCloseTo(0.075, 6);
    expect(result.cacheReadCost).toBe(0);
    expect(result.cacheCreationCost).toBe(0);
    expect(result.totalCost).toBeCloseTo(0.105, 6);
  });

  it('calculates cache token costs', () => {
    const result = calculateCost(0, 0, 8_000, 2_000, DEFAULT_COST_RATES);

    // cacheRead: 8000 / 1M * 0.30 = 0.0024
    // cacheCreation: 2000 / 1M * 3.75 = 0.0075
    expect(result.cacheReadCost).toBeCloseTo(0.0024, 6);
    expect(result.cacheCreationCost).toBeCloseTo(0.0075, 6);
    expect(result.totalCost).toBeCloseTo(0.0099, 6);
  });

  it('returns zero for all zero tokens', () => {
    const result = calculateCost(0, 0, 0, 0);

    expect(result.totalCost).toBe(0);
    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
    expect(result.cacheReadCost).toBe(0);
    expect(result.cacheCreationCost).toBe(0);
  });

  it('supports custom rates', () => {
    const customRates = {
      inputPerMtok: 10.00,
      outputPerMtok: 30.00,
      cacheReadPerMtok: 1.00,
      cacheCreationPerMtok: 5.00,
    };
    const result = calculateCost(1_000_000, 500_000, 100_000, 50_000, customRates);

    expect(result.inputCost).toBeCloseTo(10.00, 4);
    expect(result.outputCost).toBeCloseTo(15.00, 4);
    expect(result.cacheReadCost).toBeCloseTo(0.10, 4);
    expect(result.cacheCreationCost).toBeCloseTo(0.25, 4);
    expect(result.totalCost).toBeCloseTo(25.35, 4);
  });
});

describe('calculateCostByModel', () => {
  it('applies per-model pricing for known models', () => {
    const modelTokens: ModelTokenMap = {
      'claude-sonnet-4-20250514': {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      'claude-opus-4-20250514': {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    };

    const result = calculateCostByModel(modelTokens);

    // Sonnet: input 1M * 3 = 3.00, output 0.5M * 15 = 7.50
    // Opus: input 0.1M * 15 = 1.50, output 0.05M * 75 = 3.75
    expect(result.inputCost).toBeCloseTo(3.00 + 1.50, 4);
    expect(result.outputCost).toBeCloseTo(7.50 + 3.75, 4);
    expect(result.totalCost).toBeCloseTo(15.75, 4);
  });

  it('falls back to custom rates for unknown models', () => {
    const modelTokens: ModelTokenMap = {
      'unknown-model-v1': {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    };

    const customRates = { ...DEFAULT_COST_RATES, inputPerMtok: 5.00 };
    const result = calculateCostByModel(modelTokens, customRates);

    expect(result.inputCost).toBeCloseTo(5.00, 4);
  });

  it('handles empty model map', () => {
    const result = calculateCostByModel({});
    expect(result.totalCost).toBe(0);
  });

  it('handles multi-model with cache tokens', () => {
    const modelTokens: ModelTokenMap = {
      'claude-haiku-4-20250514': {
        inputTokens: 500_000,
        outputTokens: 200_000,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 100_000,
      },
    };

    const result = calculateCostByModel(modelTokens);

    // Haiku: input 0.5M * 0.80 = 0.40, output 0.2M * 4.00 = 0.80
    // cacheRead: 1M * 0.08 = 0.08, cacheCreation: 0.1M * 1.00 = 0.10
    expect(result.inputCost).toBeCloseTo(0.40, 4);
    expect(result.outputCost).toBeCloseTo(0.80, 4);
    expect(result.cacheReadCost).toBeCloseTo(0.08, 4);
    expect(result.cacheCreationCost).toBeCloseTo(0.10, 4);
    expect(result.totalCost).toBeCloseTo(1.38, 4);
  });
});
