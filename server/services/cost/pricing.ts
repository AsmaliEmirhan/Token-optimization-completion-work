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

export interface ModelPricing {
  provider: string;
  model: string;

  inputPerMillionTokens: number | null;
  outputPerMillionTokens: number | null;

  thinkingBillingMode: 'included_in_output' | 'separate' | 'unknown';

  thinkingPerMillionTokens?: number | null;

  currency: 'USD';

  source?: string;
  verifiedAt?: string;
}

/**
 * Static registry of verified model pricing.
 * Key format: `${provider.toLowerCase()}:${model.toLowerCase()}`
 */
const PRICING_REGISTRY: Record<string, ModelPricing> = {
  // ==========================================
  // OpenAI
  // Source: https://openai.com/api/pricing/
  // Verified: 2025-01 / 2025-02
  // Currency: USD
  // ==========================================
  'openai:gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    inputPerMillionTokens: 2.50,
    outputPerMillionTokens: 10.00,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://openai.com/api/pricing/',
    verifiedAt: '2025-02-01',
  },
  'openai:gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPerMillionTokens: 0.15,
    outputPerMillionTokens: 0.60,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://openai.com/api/pricing/',
    verifiedAt: '2025-02-01',
  },
  'openai:gpt-4-turbo': {
    provider: 'openai',
    model: 'gpt-4-turbo',
    inputPerMillionTokens: 10.00,
    outputPerMillionTokens: 30.00,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://openai.com/api/pricing/',
    verifiedAt: '2025-02-01',
  },
  'openai:gpt-3.5-turbo': {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    inputPerMillionTokens: 0.50,
    outputPerMillionTokens: 1.50,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://openai.com/api/pricing/',
    verifiedAt: '2025-02-01',
  },
  'openai:o1': {
    provider: 'openai',
    model: 'o1',
    inputPerMillionTokens: 15.00,
    outputPerMillionTokens: 60.00,
    // OpenAI includes reasoning tokens in completion_tokens and bills them at the output rate
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://openai.com/api/pricing/',
    verifiedAt: '2025-02-01',
  },
  'openai:o1-mini': {
    provider: 'openai',
    model: 'o1-mini',
    inputPerMillionTokens: 3.00,
    outputPerMillionTokens: 12.00,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://openai.com/api/pricing/',
    verifiedAt: '2025-02-01',
  },
  'openai:o3-mini': {
    provider: 'openai',
    model: 'o3-mini',
    inputPerMillionTokens: 1.10,
    outputPerMillionTokens: 4.40,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://openai.com/api/pricing/',
    verifiedAt: '2025-02-01',
  },

  // ==========================================
  // Google Gemini
  // Source: https://ai.google.dev/pricing
  // Verified: 2025-01 / 2025-02
  // Currency: USD (Prompts <= 128k context)
  // ==========================================
  'gemini:gemini-1.5-flash': {
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    inputPerMillionTokens: 0.075,
    outputPerMillionTokens: 0.30,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://ai.google.dev/pricing',
    verifiedAt: '2025-02-01',
  },
  'gemini:gemini-1.5-flash-8b': {
    provider: 'gemini',
    model: 'gemini-1.5-flash-8b',
    inputPerMillionTokens: 0.0375,
    outputPerMillionTokens: 0.15,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://ai.google.dev/pricing',
    verifiedAt: '2025-02-01',
  },
  'gemini:gemini-1.5-pro': {
    provider: 'gemini',
    model: 'gemini-1.5-pro',
    inputPerMillionTokens: 1.25,
    outputPerMillionTokens: 5.00,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://ai.google.dev/pricing',
    verifiedAt: '2025-02-01',
  },
  'gemini:gemini-2.0-flash': {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    inputPerMillionTokens: 0.10,
    outputPerMillionTokens: 0.40,
    // Google Gemini bills thoughtsTokenCount as part of candidate tokens at output rate
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://ai.google.dev/pricing',
    verifiedAt: '2025-02-01',
  },
  'gemini:gemini-2.0-flash-lite': {
    provider: 'gemini',
    model: 'gemini-2.0-flash-lite',
    inputPerMillionTokens: 0.075,
    outputPerMillionTokens: 0.30,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://ai.google.dev/pricing',
    verifiedAt: '2025-02-01',
  },

  // ==========================================
  // Groq
  // Source: https://groq.com/pricing/
  // Verified: 2025-01 / 2025-02
  // Currency: USD
  // ==========================================
  'groq:llama3-70b-8192': {
    provider: 'groq',
    model: 'llama3-70b-8192',
    inputPerMillionTokens: 0.59,
    outputPerMillionTokens: 0.79,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2025-02-01',
  },
  'groq:llama3-8b-8192': {
    provider: 'groq',
    model: 'llama3-8b-8192',
    inputPerMillionTokens: 0.05,
    outputPerMillionTokens: 0.08,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2025-02-01',
  },
  'groq:llama-3.1-70b-versatile': {
    provider: 'groq',
    model: 'llama-3.1-70b-versatile',
    inputPerMillionTokens: 0.59,
    outputPerMillionTokens: 0.79,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2025-02-01',
  },
  'groq:llama-3.1-8b-instant': {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    inputPerMillionTokens: 0.05,
    outputPerMillionTokens: 0.08,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2025-02-01',
  },
  'groq:llama-3.3-70b-versatile': {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    inputPerMillionTokens: 0.59,
    outputPerMillionTokens: 0.79,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2025-02-01',
  },
  'groq:mixtral-8x7b-32768': {
    provider: 'groq',
    model: 'mixtral-8x7b-32768',
    inputPerMillionTokens: 0.24,
    outputPerMillionTokens: 0.24,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2025-02-01',
  },
  'groq:gemma2-9b-it': {
    provider: 'groq',
    model: 'gemma2-9b-it',
    inputPerMillionTokens: 0.20,
    outputPerMillionTokens: 0.20,
    thinkingBillingMode: 'included_in_output',
    currency: 'USD',
    source: 'https://groq.com/pricing/',
    verifiedAt: '2025-02-01',
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
  'gemini:gemini-1.5-pro-latest': 'gemini:gemini-1.5-pro',
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
