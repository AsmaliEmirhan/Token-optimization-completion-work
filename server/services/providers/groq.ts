import Groq from 'groq-sdk';
import type { LLMProvider, LLMResponse } from '../../types/api.js';

export const groqProvider: LLMProvider = {
  async sendMessage({ apiKey, model, message }) {
    const start = performance.now();
    const groq = new Groq({ apiKey });

    const response = await groq.chat.completions.create({
      model,
      messages: [{ role: 'user', content: message }],
    });

    const end = performance.now();
    const usage = response.usage;

    const inputTokens = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    const outputTokens = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null;
    const thinkingTokens = typeof (usage as any)?.completion_tokens_details?.reasoning_tokens === 'number'
      ? (usage as any).completion_tokens_details.reasoning_tokens
      : null;
    const totalTokens = typeof usage?.total_tokens === 'number' ? usage.total_tokens : null;

    return {
      content: response.choices[0]?.message?.content || '',
      usage: {
        inputTokens,
        outputTokens,
        thinkingTokens,
        totalTokens,
      },
      latencyMs: Math.round(end - start),
    };
  },
};
