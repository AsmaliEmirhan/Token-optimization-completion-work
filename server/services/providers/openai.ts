import OpenAI from 'openai';
import { LLMProvider, LLMResponse } from '../../types/api';

export const openaiProvider: LLMProvider = {
  async sendMessage({ apiKey, model, message }) {
    const start = performance.now();
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: message }],
    });

    const end = performance.now();

    return {
      content: response.choices[0]?.message?.content || '',
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      },
      latencyMs: end - start,
    };
  },
};
