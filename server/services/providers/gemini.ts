import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider, LLMResponse } from '../../types/api.js';

export const geminiProvider: LLMProvider = {
  async sendMessage({ apiKey, model, message }) {
    console.log(`[Chat] Provider: gemini`);
    console.log(`[Chat] Model: ${model}`);
    console.log(`[Gemini] Starting request`);

    const start = performance.now();
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model });

      const result = await genModel.generateContent(message);
      const response = await result.response;
      const text = response.text();

      const end = performance.now();
      console.log(`[Gemini] Response received`);
      
      const usage = response.usageMetadata;

      const inputTokens = typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : null;
      const outputTokens = typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null;
      const thinkingTokens = typeof (usage as any)?.thoughtsTokenCount === 'number' 
        ? (usage as any).thoughtsTokenCount 
        : null;
      const totalTokens = typeof usage?.totalTokenCount === 'number' ? usage.totalTokenCount : null;

      return {
        content: text,
        usage: {
          inputTokens,
          outputTokens,
          thinkingTokens,
          totalTokens,
        },
        latencyMs: Math.round(end - start),
      };
    } catch (error: any) {
      console.error(`[Gemini] Request failed`);
      console.error(`Status: ${error.status || 'Unknown'}`);
      console.error(`Message: ${error.message || 'Unknown provider error'}`);
      throw error;
    }
  },
};
