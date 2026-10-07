/**
 * Centralized static pricing registry for LLM providers.
 *
 * RULES:
 * 1. Never invent prices.
 * 2. Only add prices that are confidently verified from official provider documentation.
 * 3. Currency is strictly USD.
 * 4. Prices are stored in USD per 1 Million tokens (standard industry pricing unit).
 * 5. Unknown or unverified models return null (never 0).
 */

export type ThinkingBillingMode =
  | 'billed_at_output_rate'     // Thinking tokens are reported separately and billed at output rate (e.g. Gemini 3.5 Flash)
  | 'already_in_output_tokens'  // Thinking/reasoning tokens are already counted in output tokens (e.g. OpenAI o1/o3)
  | 'separate_rate'             // Thinking tokens are billed at an explicit dedicated thinking rate
  | 'not_billed'                // Thinking tokens are not billed or model does not produce thinking tokens
  | 'unknown';                  // Unknown billing mode; if thinking tokens > 0, totalCost must be null

export interface ModelPricing {
  provider: string;
  model: string;

  inputPerMillionTokens: number | null;
  outputPerMillionTokens: number | null;

  thinkingBillingMode: ThinkingBillingMode;
  thinkingPerMillionTokens?: number | null;

  serviceTier?: string; // e.g. 'standard'
  currency: 'USD';

  source: string;
  verifiedAt: string;
}

/**
 * Static registry of verified model pricing.
 * Key format: `${provider.toLowerCase()}:${model.toLowerCase()}`
 */
const PRICING_REGISTRY: Record<string, ModelPricing> = {
  // ==========================================
  // Google Gemini
  // Source: https://ai.google.dev/gemini-api/docs/pricing
  // Verified: 2026-10-07
  // Currency: USD (Standard paid tier list prices)
  // Note: Gemini official billing explicitly states output price includes thinking tokens.
  // ==========================================
  'gemini:gemini-3.5-flash': {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    inputPerMillionTokens: 1.50,
    outputPerMillionTokens: 9.00,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-3.5-flash-lite': {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    inputPerMillionTokens: 0.30,
    outputPerMillionTokens: 2.50,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-3.6-flash': {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    inputPerMillionTokens: 1.50,
    outputPerMillionTokens: 7.50,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-3.7-flash': {
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    inputPerMillionTokens: 0.75, // Introductory standard rate through Dec 31, 2026 ($1.50 standard starting 2027)
    outputPerMillionTokens: 3.75, // Introductory standard rate through Dec 31, 2026 ($7.50 standard starting 2027)
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-3.8-flash': {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    inputPerMillionTokens: 0.75, // Introductory standard rate through Dec 31, 2026 ($1.50 standard starting 2027)
    outputPerMillionTokens: 3.75, // Introductory standard rate through Dec 31, 2026 ($7.50 standard starting 2027)
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-2.0-flash': {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    inputPerMillionTokens: 0.10,
    outputPerMillionTokens: 0.40,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-2.0-flash-lite': {
    provider: 'gemini',
    model: 'gemini-2.0-flash-lite',
    inputPerMillionTokens: 0.075,
    outputPerMillionTokens: 0.30,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-1.5-flash': {
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    inputPerMillionTokens: 0.075,
    outputPerMillionTokens: 0.30,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-1.5-flash-8b': {
    provider: 'gemini',
    model: 'gemini-1.5-flash-8b',
    inputPerMillionTokens: 0.0375,
    outputPerMillionTokens: 0.15,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'gemini:gemini-1.5-pro': {
    provider: 'gemini',
    model: 'gemini-1.5-pro',
    inputPerMillionTokens: 1.25,
    outputPerMillionTokens: 5.00,
    thinkingBillingMode: 'billed_at_output_rate',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedAt: '2026-10-07',
  },

  // ==========================================
  // OpenAI
  // Source: https://developers.openai.com/api/docs/pricing
  // Verified: 2026-10-07
  // Currency: USD (Standard synchronous API list prices)
  // ==========================================
  'openai:gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    inputPerMillionTokens: 2.50,
    outputPerMillionTokens: 10.00,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'openai:gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPerMillionTokens: 0.15,
    outputPerMillionTokens: 0.60,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'openai:gpt-4-turbo': {
    provider: 'openai',
    model: 'gpt-4-turbo',
    inputPerMillionTokens: 10.00,
    outputPerMillionTokens: 30.00,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'openai:gpt-3.5-turbo': {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    inputPerMillionTokens: 0.50,
    outputPerMillionTokens: 1.50,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'openai:o1': {
    provider: 'openai',
    model: 'o1',
    inputPerMillionTokens: 15.00,
    outputPerMillionTokens: 60.00,
    thinkingBillingMode: 'already_in_output_tokens',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'openai:o1-mini': {
    provider: 'openai',
    model: 'o1-mini',
    inputPerMillionTokens: 3.00,
    outputPerMillionTokens: 12.00,
    thinkingBillingMode: 'already_in_output_tokens',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-10-07',
  },
  'openai:o3-mini': {
    provider: 'openai',
    model: 'o3-mini',
    inputPerMillionTokens: 1.10,
    outputPerMillionTokens: 4.40,
    thinkingBillingMode: 'already_in_output_tokens',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-10-07',
  },

  // ==========================================
  // Groq
  // Source: https://groq.com/pricing/
  // Verified: 2026-10-07
  // Currency: USD (Standard on-demand API list prices)
  // ==========================================
  'groq:llama3-70b-8192': {
    provider: 'groq',
    model: 'llama3-70b-8192',
    inputPerMillionTokens: 0.59,
    outputPerMillionTokens: 0.79,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2026-10-07',
  },
  'groq:llama3-8b-8192': {
    provider: 'groq',
    model: 'llama3-8b-8192',
    inputPerMillionTokens: 0.05,
    outputPerMillionTokens: 0.08,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2026-10-07',
  },
  'groq:llama-3.1-8b-instant': {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    inputPerMillionTokens: 0.05,
    outputPerMillionTokens: 0.08,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2026-10-07',
  },
  'groq:llama-3.3-70b-versatile': {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    inputPerMillionTokens: 0.59,
    outputPerMillionTokens: 0.79,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2026-10-07',
  },
  'groq:mixtral-8x7b-32768': {
    provider: 'groq',
    model: 'mixtral-8x7b-32768',
    inputPerMillionTokens: 0.24,
    outputPerMillionTokens: 0.24,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2026-10-07',
  },
  'groq:gemma2-9b-it': {
    provider: 'groq',
    model: 'gemma2-9b-it',
    inputPerMillionTokens: 0.20,
    outputPerMillionTokens: 0.20,
    thinkingBillingMode: 'not_billed',
    serviceTier: 'standard',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2026-10-07',
  },
};

/**
 * Explicit model aliases to canonical models in the registry.
 * Only exact known aliases are permitted.
 */
const MODEL_ALIASES: Record<string, string> = {
  'openai:gpt-4o-2024-08-06': 'openai:gpt-4o',
  'openai:gpt-4o-2024-05-13': 'openai:gpt-4o',
  'openai:gpt-4o-mini-2024-07-18': 'openai:gpt-4o-mini',
  'openai:gpt-4-turbo-2024-04-09': 'openai:gpt-4-turbo',
  'openai:gpt-3.5-turbo-0125': 'openai:gpt-3.5-turbo',
  'gemini:gemini-1.5-flash-latest': 'gemini:gemini-1.5-flash',
  'gemini:gemini-flash-latest': 'gemini:gemini-1.5-flash',
  'gemini:gemini-flash-lite-latest': 'gemini:gemini-2.0-flash-lite',
  'gemini:gemini-1.5-pro-latest': 'gemini:gemini-1.5-pro',
  'gemini:gemini-pro-latest': 'gemini:gemini-1.5-pro',
  'gemini:gemini-2.0-flash-exp': 'gemini:gemini-2.0-flash',
  'gemini:gemini-2.0-flash-lite-preview': 'gemini:gemini-2.0-flash-lite',
};

/**
 * Looks up pricing for an exact provider ID and raw model ID.
 * Returns null if the model is unconfigured or unknown.
 */
export function getModelPricing(provider: string, model: string): ModelPricing | null {
  if (!provider || !model) return null;

  const cleanProvider = provider.trim().toLowerCase();
  const cleanModel = model.trim().toLowerCase();

  const key = `${cleanProvider}:${cleanModel}`;

  // Direct lookup
  if (PRICING_REGISTRY[key]) {
    return PRICING_REGISTRY[key];
  }

  // Alias lookup
  const canonicalKey = MODEL_ALIASES[key];
  if (canonicalKey && PRICING_REGISTRY[canonicalKey]) {
    return PRICING_REGISTRY[canonicalKey];
  }

  // Unknown model -> return null (never invent or assume 0)
  return null;
}
