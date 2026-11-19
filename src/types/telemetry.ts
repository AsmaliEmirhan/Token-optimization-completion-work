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
  bypassReason?: string | null;
  questionCategory?: 'genel' | 'kisisel' | 'degisken' | 'sanatsal' | null;
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

  // Cost fields calculated by the cost engine
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
  estimatedAvoidedCost?: number | null;
  cacheStatus?: 'HIT' | 'MISS' | 'BYPASS' | null;
  bypassReason?: string | null;
  questionCategory?: 'genel' | 'kisisel' | 'degisken' | 'sanatsal' | null;
  sourceProvider?: string | null;
  sourceModel?: string | null;
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

  // L1 Cache analysis data
  cacheHit?: boolean;
  cacheType?: null | 'exact' | 'semantic';
  cacheStatus?: 'HIT' | 'MISS' | 'BYPASS' | null;
  bypassReason?: string | null;
  questionCategory?: 'genel' | 'kisisel' | 'degisken' | 'sanatsal' | null;
  sourceProvider?: string | null;
  sourceModel?: string | null;
  estimatedAvoidedCost?: number | null;
  mode?: 'baseline' | 'optimized';
}
