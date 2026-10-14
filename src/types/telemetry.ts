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
  cacheEligible: boolean;
  cacheBypassReason: string | null;
  responseSource: 'provider' | 'l1_exact_cache' | 'inflight_shared';
  cacheStatus: 'miss' | 'hit' | 'bypass' | 'inflight_shared';
  cacheWriteReason: string | null;
  cacheInfrastructureCost: number | null;
  sourceProvider: string;
  sourceModel: string;
  sourceRequestId: string;
  cacheEntryId: string | null;
  cacheLookupLatencyMs: number | null;

  sourceInputTokens: number | null;
  sourceOutputTokens: number | null;
  sourceThinkingTokens: number | null;
  sourceTotalTokens: number | null;
  avoidedEstimatedTokens: number | null;
  avoidedEstimatedApiCost: number | null;

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

export interface RequestMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  inputCost?: number | null;
  outputCost?: number | null;
  totalCost?: number | null;
}

export interface ExperimentRecord {
  id: string; // Canonical requestId from backend
  timestamp: number;
  mode: 'baseline' | 'optimized';
  provider: string;
  model: string;
  prompt: string;
  response?: string;
  comparisonGroupId?: string;
  telemetry?: RequestTelemetry;
  metrics: RequestMetrics;
}

export interface ChatApiResponse {
  message: {
    role: 'assistant';
    content: string;
  };
  provider: string;
  model: string;
  telemetry: RequestTelemetry;
  metrics?: RequestMetrics;
}

export interface RequestAnalysisData {
  provider: string;
  model: string;

  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;

  latencyMs: number;

  inputCost?: number | null;
  outputCost?: number | null;
  totalCost?: number | null;

  cacheHit: boolean;
  cacheEligible: boolean;
  responseSource: 'provider' | 'l1_exact_cache' | 'inflight_shared';
  cacheStatus: 'miss' | 'hit' | 'bypass' | 'inflight_shared';
  cacheBypassReason: string | null;
  sourceTotalTokens: number | null;
  sourceRequestId: string;
  sourceProvider: string;
  sourceModel: string;
  avoidedEstimatedTokens: number | null;
  avoidedEstimatedApiCost: number | null;
}


