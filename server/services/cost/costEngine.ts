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
  thinkingCost?: number | null;
  totalCost: number | null;
  billableInputTokens?: number | null;
  billableOutputTokens?: number | null;
  pricingAvailable: boolean;
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
 * 1. If model is unknown or has no pricing, returns null for all cost fields (never 0) and pricingAvailable: false.
 * 2. Thinking tokens are handled according to the verified thinkingBillingMode:
 *    - 'billed_at_output_rate': Thinking tokens are reported separately but billed at output rate (e.g. Gemini 3.5 Flash).
 *      billableOutputTokens = outputTokens + thinkingTokens.
 *    - 'already_in_output_tokens': Thinking tokens are already contained in outputTokens (e.g. OpenAI o1/o3).
 *      billableOutputTokens = outputTokens.
 *    - 'separate_rate': Thinking tokens are billed at a dedicated thinking rate.
 *    - 'not_billed': Thinking tokens are not charged.
 *    - 'unknown': If thinking tokens > 0, totalCost becomes null to prevent guessing.
 * 3. Total cost requires all applicable billing components to be non-null; otherwise totalCost is null.
 * 4. Zero tokens produce valid 0 calculation, not null.
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
      thinkingCost: null,
      totalCost: null,
      billableInputTokens: null,
      billableOutputTokens: null,
      pricingAvailable: false,
    };
  }

  // 1. Calculate Input Cost
  const billableInputTokens = usage.inputTokens;
  const inputCost = calculateTokenCost(billableInputTokens, pricing.inputPerMillionTokens);

  // 2. Evaluate billable output tokens and thinking tokens according to mode
  let billableOutputTokens: number | null = null;
  let outputCost: number | null = null;
  let thinkingCost: number | null = 0;
  let thinkingCostToAdd = 0;

  switch (pricing.thinkingBillingMode) {
    case 'billed_at_output_rate': {
      // Thinking tokens are reported separately by telemetry but billed at the output rate (e.g. Gemini 3.5 Flash)
      if (usage.outputTokens !== null && usage.outputTokens !== undefined) {
        const thinking = usage.thinkingTokens ?? 0;
        billableOutputTokens = usage.outputTokens + thinking;
        outputCost = calculateTokenCost(billableOutputTokens, pricing.outputPerMillionTokens);
        thinkingCost = calculateTokenCost(thinking, pricing.outputPerMillionTokens);
        // thinkingCost is already included in outputCost through billableOutputTokens
        thinkingCostToAdd = 0;
      } else {
        billableOutputTokens = null;
        outputCost = null;
        thinkingCost = null;
      }
      break;
    }

    case 'already_in_output_tokens': {
      // Provider already includes thinking tokens inside output tokens (e.g. OpenAI o1)
      billableOutputTokens = usage.outputTokens;
      outputCost = calculateTokenCost(billableOutputTokens, pricing.outputPerMillionTokens);
      thinkingCost = calculateTokenCost(usage.thinkingTokens ?? 0, pricing.outputPerMillionTokens);
      // Already inside outputCost; do not double count
      thinkingCostToAdd = 0;
      break;
    }

    case 'separate_rate': {
      // Dedicated separate rate for thinking tokens
      billableOutputTokens = usage.outputTokens;
      outputCost = calculateTokenCost(billableOutputTokens, pricing.outputPerMillionTokens);
      if (usage.thinkingTokens && usage.thinkingTokens > 0) {
        if (typeof pricing.thinkingPerMillionTokens === 'number') {
          thinkingCost = calculateTokenCost(usage.thinkingTokens, pricing.thinkingPerMillionTokens);
          thinkingCostToAdd = thinkingCost ?? 0;
        } else {
          thinkingCost = null;
        }
      } else {
        thinkingCost = 0;
        thinkingCostToAdd = 0;
      }
      break;
    }

    case 'not_billed': {
      billableOutputTokens = usage.outputTokens;
      outputCost = calculateTokenCost(billableOutputTokens, pricing.outputPerMillionTokens);
      thinkingCost = 0;
      thinkingCostToAdd = 0;
      break;
    }

    case 'unknown':
    default: {
      if (usage.thinkingTokens && usage.thinkingTokens > 0) {
        // Unknown billing behavior with active thinking tokens -> do not guess
        billableOutputTokens = usage.outputTokens;
        outputCost = calculateTokenCost(billableOutputTokens, pricing.outputPerMillionTokens);
        thinkingCost = null;
      } else {
        billableOutputTokens = usage.outputTokens;
        outputCost = calculateTokenCost(billableOutputTokens, pricing.outputPerMillionTokens);
        thinkingCost = 0;
        thinkingCostToAdd = 0;
      }
      break;
    }
  }

  // 3. Calculate Total Cost
  let totalCost: number | null = null;
  if (inputCost !== null && outputCost !== null && thinkingCost !== null) {
    totalCost = inputCost + outputCost + thinkingCostToAdd;
  }

  return {
    inputCost,
    outputCost,
    thinkingCost,
    totalCost,
    billableInputTokens,
    billableOutputTokens,
    pricingAvailable: true,
  };
}
