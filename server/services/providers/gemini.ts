import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, LLMResponse } from '../../types/api';

export const geminiProvider: LLMProvider = {
  async sendMessage({ apiKey, model, message }) {
    console.log(`[Chat] Provider: gemini`);
    console.log(`[Chat] Model: ${model}`);
    console.log(`[Gemini] API key configured: ${!!apiKey}`);
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

      return {
        content: text,
        usage: {
          inputTokens: usage?.promptTokenCount ?? null,
          outputTokens: usage?.candidatesTokenCount ?? null,
          thinkingTokens: usage && 'thoughtsTokenCount' in usage ? (usage as any).thoughtsTokenCount : null,
          totalTokens: usage?.totalTokenCount ?? null,
        },
        latencyMs: end - start,
      };
    } catch (error: any) {
      console.error(`[Gemini] Request failed`);
      console.error(`Status: ${error.status || 'Unknown'}`);
      console.error(`Message: ${error.message || 'Unknown provider error'}`);
      throw error;
    }
  },
};
