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

  // L1 Exact Match Cache telemetry
  cacheHit: boolean;
  cacheType: null | 'exact' | 'semantic';
  cacheStatus?: 'HIT' | 'MISS' | 'BYPASS' | null;
  /** BYPASS ise gerçek nedeni (ör. CATEGORY_KISISEL, CLASSIFIER_UNAVAILABLE, DB_UNAVAILABLE) */
  bypassReason?: string | null;
  questionCategory?: 'genel' | 'kisisel' | 'degisken' | 'sanatsal' | null;
  /** Tahmin edilen sınıfın olasılığı (sınıflandırıcı maliyeti/tokenı değildir) */
  classifierConfidence?: number | null;
  classifierModel?: string | null;
  sourceProvider?: string | null;
  sourceModel?: string | null;
  estimatedAvoidedCost?: number | null;
  cachedSaved?: boolean;
  mode?: 'baseline' | 'optimized';

  compressionUsed: boolean;
  compressionRatio: number | null;

  validatorPassed: boolean | null;
  escalated: boolean;

  routerPolicy: string | null;
  routerConfidence: number | null;

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
    inputCost?: number | null;
    outputCost?: number | null;
    totalCost?: number | null;
    estimatedAvoidedCost?: number | null;
  };
}
