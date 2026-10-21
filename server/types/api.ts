export interface RequestTelemetry {
  requestId: string;
  timestamp: number;

  provider: string;
  model: string;

  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;

  latencyMs: number;

  // Reserved for future optimization stages
  cacheHit: boolean;
  cacheType: null | 'exact' | 'semantic';

  compressionUsed: boolean;
  compressionRatio: number | null;

  validatorPassed: boolean | null;
  escalated: boolean;

  routerPolicy: string | null;
  routerConfidence: number | null;

  // Cost fields will be calculated by the cost engine later.
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
}

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

export interface ChatApiResponse {
  message: {
    role: 'assistant';
    content: string;
  };
  provider: string;
  model: string;
  telemetry: RequestTelemetry;
  metrics: {
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    totalTokens: number | null;
    latencyMs: number;
  };
}

