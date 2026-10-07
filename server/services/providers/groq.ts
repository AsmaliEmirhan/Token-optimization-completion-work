import Groq from 'groq-sdk';
import { LLMProvider, LLMResponse } from '../../types/api';

export const groqProvider: LLMProvider = {
  async sendMessage({ apiKey, model, message }) {
    const start = performance.now();
    const groq = new Groq({ apiKey });

    const response = await groq.chat.completions.create({
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
