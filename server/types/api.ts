import type {
  ConversationMessage,
  GenerationParameters,
  StableExternalContext,
  PrivacyClassification,
} from '../services/cache/cacheTypes.js';

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
  privacyClassification: PrivacyClassification;
  privacyConfidence: number | null;
  classifierCalls: number;
  classifierInputTokens: number | null;
  classifierOutputTokens: number | null;
  classifierTotalTokens: number | null;
  classifierLatencyMs: number;
  classifierEstimatedCost: number | null;
  pipelineTotalTokens: number | null;
  pipelineTotalCost: number | null;
  netAvoidedEstimatedTokens: number | null;
  netAvoidedEstimatedApiCost: number | null;
  cacheScope: 'shared' | 'user_private' | 'session_private' | null;
  cacheDecisionReason: string;
  cachePolicyVersion: string;
  cacheValidationStatus: 'approved' | 'rejected' | 'uncertain';
  cacheBypassReason: string | null;
  responseSource: 'provider' | 'l1_exact_cache' | 'shared_l1_cache' | 'private_l1_cache' | 'inflight_shared';
  cacheStatus: 'miss' | 'hit' | 'bypass' | 'inflight_shared';
  cacheWriteReason: string | null;
  cacheInfrastructureCost: number | null;
  sourceProvider: string;
  sourceModel: string;
  sourceRequestId: string;
  cacheEntryId: string | null;
  cacheLookupLatencyMs: number | null;

  // Geçmişteki kaynak kullanım ile bu isteğin gerçek kullanımını ayrı tutuyoruz.
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

export interface LLMResponse {
  content: string;
  cacheable: boolean;
  // Sağlayıcı adaptörü gözlemlerini taşır; içerik için semantik güvenlik iddiası değildir.
  safety?: {
    complete: boolean;
    hasToolCalls: boolean;
    hasRetrieval: boolean;
    hasPrivateContext: boolean;
    flagged: boolean;
  };
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
    systemInstructions?: string;
    conversation?: ConversationMessage[];
    generationParameters?: GenerationParameters;
    signal?: AbortSignal;
  }): Promise<LLMResponse>;
}

export interface ChatApiRequest {
  provider: string;
  model: string;
  message: string;
  systemInstructions?: string;
  conversation?: ConversationMessage[];
  generationParameters?: GenerationParameters;
  toolContext?: StableExternalContext | null;
  retrievalContext?: StableExternalContext | null;
  stream?: boolean;
  hasExternalSideEffects?: boolean;
  forceCacheBypass?: boolean;
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

