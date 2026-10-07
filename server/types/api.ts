export interface LLMResponse {
  content: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    totalTokens: number | null;
  };
  latencyMs: number;
}

export interface LLMProvider {
  sendMessage(params: {
    apiKey: string;
    model: string;
    message: string;
  }): Promise<LLMResponse>;
}
