import type { CostBreakdown, CostRates } from './sidebar/types';
import type { ModelTokenMap } from './transcriptParser';

/**
 * Default pricing rates per million tokens (USD).
 * These match Claude Sonnet 4 pricing as of 2025.
 */
export const DEFAULT_COST_RATES: CostRates = {
  inputPerMtok: 3.00,
  outputPerMtok: 15.00,
  cacheReadPerMtok: 0.30,
  cacheCreationPerMtok: 3.75,
};

/**
 * Per-model pricing rates (per million tokens, USD).
 * When a model name contains one of these keys, the corresponding rates apply.
 */
const MODEL_RATES: Record<string, CostRates> = {
  'claude-sonnet-4': {
    inputPerMtok: 3.00,
    outputPerMtok: 15.00,
    cacheReadPerMtok: 0.30,
    cacheCreationPerMtok: 3.75,
  },
  'claude-opus-4': {
    inputPerMtok: 15.00,
    outputPerMtok: 75.00,
    cacheReadPerMtok: 1.50,
    cacheCreationPerMtok: 18.75,
  },
  'claude-haiku-4': {
    inputPerMtok: 0.80,
    outputPerMtok: 4.00,
    cacheReadPerMtok: 0.08,
    cacheCreationPerMtok: 1.00,
  },
};

/**
 * Resolves the cost rates for a given model name.
 * Falls back to the provided custom rates or the defaults.
 */
function getRatesForModel(model: string, customRates: CostRates): CostRates {
  for (const [key, rates] of Object.entries(MODEL_RATES)) {
    if (model.includes(key)) {
      return rates;
    }
  }
  return customRates;
}

function tokenCost(tokens: number, ratePerMtok: number): number {
  return (tokens / 1_000_000) * ratePerMtok;
}

/**
 * Calculates cost from aggregated totals using a single rate.
 * Suitable when per-model breakdown is not available.
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  rates: CostRates = DEFAULT_COST_RATES,
): CostBreakdown {
  const inputCost = tokenCost(inputTokens, rates.inputPerMtok);
  const outputCost = tokenCost(outputTokens, rates.outputPerMtok);
  const cacheReadCost = tokenCost(cacheReadTokens, rates.cacheReadPerMtok);
  const cacheCreationCost = tokenCost(cacheCreationTokens, rates.cacheCreationPerMtok);

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheCreationCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheCreationCost,
  };
}

/**
 * Calculates cost from per-model token breakdown.
 * Applies the correct pricing rate per model, falling back to custom/default rates
 * for unrecognized models.
 */
export function calculateCostByModel(
  modelTokens: ModelTokenMap,
  customRates: CostRates = DEFAULT_COST_RATES,
): CostBreakdown {
  let inputCost = 0;
  let outputCost = 0;
  let cacheReadCost = 0;
  let cacheCreationCost = 0;

  for (const [model, tokens] of Object.entries(modelTokens)) {
    const rates = getRatesForModel(model, customRates);
    inputCost += tokenCost(tokens.inputTokens, rates.inputPerMtok);
    outputCost += tokenCost(tokens.outputTokens, rates.outputPerMtok);
    cacheReadCost += tokenCost(tokens.cacheReadTokens, rates.cacheReadPerMtok);
    cacheCreationCost += tokenCost(tokens.cacheCreationTokens, rates.cacheCreationPerMtok);
  }

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheCreationCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheCreationCost,
  };
}
