import { getModelPricing, type ModelPricing } from './pricing.js';

export interface UsageTokens {
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
}

export interface CalculatedCost {
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
}

/**
 * Pure calculation helper: (tokens / 1,000,000) * pricePerMillion
 * Returns null if tokens or price is null/undefined or negative.
 */
export function calculateTokenCost(
  tokens: number | null | undefined,
  pricePerMillionTokens: number | null | undefined
): number | null {
  if (
    tokens === null ||
    tokens === undefined ||
    pricePerMillionTokens === null ||
    pricePerMillionTokens === undefined
  ) {
    return null;
  }

  if (tokens < 0 || pricePerMillionTokens < 0) {
    return null;
  }

  return (tokens / 1_000_000) * pricePerMillionTokens;
}

/**
 * Calculates monetary costs for an LLM request based on provider usage and verified pricing.
 *
 * Rules:
 * 1. If model is unknown or has no pricing, returns null for all cost fields (never 0).
 * 2. Thinking tokens are handled according to the verified thinkingBillingMode:
 *    - 'included_in_output': Thinking tokens are billed as output or included in the candidate tokens.
 *    - 'separate': Thinking tokens are billed at a dedicated thinking rate.
 *    - 'unknown': If thinking tokens > 0, totalCost becomes null to prevent guessing.
 * 3. Total cost requires all applicable billing components to be non-null; otherwise totalCost is null.
 */
export function calculateRequestCost(
  provider: string,
  model: string,
  usage: UsageTokens
): CalculatedCost {
  const pricing = getModelPricing(provider, model);

  if (!pricing) {
    return {
      inputCost: null,
      outputCost: null,
      totalCost: null,
    };
  }

  // 1. Calculate Input Cost
  const inputCost = calculateTokenCost(usage.inputTokens, pricing.inputPerMillionTokens);

  // 2. Calculate Output Cost
  const rawOutputCost = calculateTokenCost(usage.outputTokens, pricing.outputPerMillionTokens);
  const outputCost: number | null = rawOutputCost;

  // 3. Evaluate Thinking Tokens Cost according to billing mode
  let thinkingCost: number | null = 0;

  if (pricing.thinkingBillingMode === 'included_in_output') {
    // Already billed as part of output/candidates; no separate line item needed
    thinkingCost = 0;
  } else if (pricing.thinkingBillingMode === 'separate') {
    if (usage.thinkingTokens && usage.thinkingTokens > 0) {
      if (typeof pricing.thinkingPerMillionTokens === 'number') {
        thinkingCost = calculateTokenCost(usage.thinkingTokens, pricing.thinkingPerMillionTokens);
      } else {
        // Separate billing is expected but price is unknown
        thinkingCost = null;
      }
    } else {
      thinkingCost = 0;
    }
  } else {
    // 'unknown' mode
    if (usage.thinkingTokens && usage.thinkingTokens > 0) {
      // Do not guess billing behavior when thinking tokens were consumed
      thinkingCost = null;
    } else {
      thinkingCost = 0;
    }
  }

  // 4. Calculate Total Cost
  let totalCost: number | null = null;
  if (inputCost !== null && outputCost !== null && thinkingCost !== null) {
    totalCost = inputCost + outputCost + thinkingCost;
  }

  return {
    inputCost,
    outputCost,
    totalCost,
  };
}
