import { getModelPricing } from './pricing.js';
import { calculateRequestCost } from './costEngine.js';

/**
 * Calculates the estimated avoided chat API cost when a request is served from the L1 Cache.
 * Evaluates what the request WOULD HAVE COST on the user's currently selected model.
 * If the selected model has unknown pricing, returns null (never false zero).
 * Strictly excludes any classifier, database, or TokenAI platform infrastructure costs.
 */
export function calculateAvoidedCost(
  targetProvider: string,
  targetModel: string,
  prompt: string,
  cachedContent: string,
  cachedUsage?: { inputTokens: number | null; outputTokens: number | null }
): number | null {
  const pricing = getModelPricing(targetProvider, targetModel);
  if (!pricing) {
    return null; // Model pricing not configured; return unknown
  }

  // Determine estimated input tokens
  const inputTokens = (cachedUsage && typeof cachedUsage.inputTokens === 'number' && cachedUsage.inputTokens > 0)
    ? cachedUsage.inputTokens
    : Math.max(1, Math.ceil((prompt || '').length / 4));

  // Determine estimated output tokens
  const outputTokens = (cachedUsage && typeof cachedUsage.outputTokens === 'number' && cachedUsage.outputTokens > 0)
    ? cachedUsage.outputTokens
    : Math.max(1, Math.ceil((cachedContent || '').length / 4));

  const cost = calculateRequestCost(targetProvider, targetModel, {
    inputTokens,
    outputTokens,
    thinkingTokens: 0,
    totalTokens: inputTokens + outputTokens,
  });

  return cost.totalCost;
}
