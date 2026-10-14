import crypto from 'node:crypto';
import { calculateRequestCost } from '../cost/costEngine.js';
import { createExactCacheKey } from '../cache/cacheKey.js';
import { evaluateCachePolicy } from '../cache/cachePolicy.js';
import type { ExactCacheEntry, ExactCacheStore } from '../cache/cacheTypes.js';
import type { ChatApiRequest, ChatApiResponse, LLMProvider, RequestTelemetry } from '../../types/api.js';

export interface ChatServiceOptions {
  providers: Record<string, LLMProvider>;
  cache: ExactCacheStore;
  cacheTtlMs: number;
  now?: () => number;
  createId?: () => string;
}

export interface ExecuteChatOptions {
  apiKey: string;
}

function trustedAvoidedTokens(entry: ExactCacheEntry): number | null {
  const total = entry.sourceUsage.totalTokens;
  return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null;
}

export class ChatService {
  private readonly providers: Record<string, LLMProvider>;
  private readonly cache: ExactCacheStore;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(options: ChatServiceOptions) {
    this.providers = options.providers;
    this.cache = options.cache;
    this.cacheTtlMs = options.cacheTtlMs;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? crypto.randomUUID;
  }

  async execute(request: ChatApiRequest, options: ExecuteChatOptions): Promise<ChatApiResponse> {
    const providerService = this.providers[request.provider];
    if (!providerService) throw new Error('UNKNOWN_PROVIDER');

    const startedAt = performance.now();
    const requestId = this.createId();
    const requestTimestamp = this.now();
    const keyInput = {
      provider: request.provider,
      model: request.model,
      message: request.message,
      systemInstructions: request.systemInstructions ?? null,
      conversation: request.conversation ?? [],
      generationParameters: request.generationParameters ?? {},
      securityScope: request.securityScope ?? {},
      toolContext: request.toolContext ?? null,
      retrievalContext: request.retrievalContext ?? null,
    };
    const policy = evaluateCachePolicy({
      ...keyInput,
      stream: request.stream,
      hasExternalSideEffects: request.hasExternalSideEffects,
      forceCacheBypass: request.forceCacheBypass,
    });

    let cacheKey: string | null = null;
    let cacheEntry: ExactCacheEntry | null = null;
    let cacheLookupLatencyMs: number | null = null;

    if (policy.eligible) {
      // L1 yalnızca birebir anahtar eşleşmesi yapar; farklı model veya benzer anlamlı soru burada paylaşılmaz.
      cacheKey = createExactCacheKey(keyInput);
      const lookupStartedAt = performance.now();
      cacheEntry = this.cache.get(cacheKey, requestTimestamp);
      cacheLookupLatencyMs = Number((performance.now() - lookupStartedAt).toFixed(3));
    }

    if (cacheEntry) {
      const referenceCost = calculateRequestCost(
        cacheEntry.sourceProvider,
        cacheEntry.sourceModel,
        cacheEntry.sourceUsage,
      );
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

      const telemetry: RequestTelemetry = {
        requestId,
        timestamp: requestTimestamp,
        provider: request.provider,
        model: request.model,
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        totalTokens: 0,
        latencyMs,
        cacheHit: true,
        cacheType: 'exact',
        cacheEligible: true,
        cacheBypassReason: null,
        responseSource: 'l1_exact_cache',
        sourceProvider: cacheEntry.sourceProvider,
        sourceModel: cacheEntry.sourceModel,
        sourceRequestId: cacheEntry.sourceRequestId,
        cacheEntryId: cacheEntry.id,
        cacheLookupLatencyMs,
        sourceInputTokens: cacheEntry.sourceUsage.inputTokens,
        sourceOutputTokens: cacheEntry.sourceUsage.outputTokens,
        sourceThinkingTokens: cacheEntry.sourceUsage.thinkingTokens,
        sourceTotalTokens: cacheEntry.sourceUsage.totalTokens,
        // Kaynak tokenlar geçmiş üretimi anlatır; mevcut isteğin gerçek tokenları daima sıfırdır.
        avoidedEstimatedTokens: trustedAvoidedTokens(cacheEntry),
        // Tasarruf yalnızca kayıtlı tokenlar ve doğrulanmış fiyat birlikte varsa tahmin edilir.
        avoidedEstimatedApiCost: referenceCost.totalCost,
        compressionUsed: false,
        compressionRatio: null,
        validatorPassed: null,
        escalated: false,
        routerPolicy: null,
        routerConfidence: null,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
      };

      return this.toResponse(cacheEntry.content, request.provider, request.model, telemetry);
    }

    // Cache miss veya güvenlik nedeniyle bypass durumunda mevcut sağlayıcı akışı aynen çalışır.
    const result = await providerService.sendMessage({
      apiKey: options.apiKey,
      model: request.model,
      message: request.message,
      systemInstructions: request.systemInstructions,
      conversation: request.conversation,
      generationParameters: request.generationParameters,
    });
    const cost = calculateRequestCost(request.provider, request.model, result.usage);
    const responseLatencyMs = Math.max(result.latencyMs, Math.round(performance.now() - startedAt));

    let storedEntry: ExactCacheEntry | null = null;
    if (policy.eligible && cacheKey && result.cacheable && result.content.length > 0) {
      const createdAt = this.now();
      storedEntry = {
        id: this.createId(),
        key: cacheKey,
        // answerId, gelecekte L2 soru varyantlarını ortak bir yanıt deposuna bağlayabilmek için ayrıdır.
        answerId: this.createId(),
        content: result.content,
        sourceProvider: request.provider,
        sourceModel: request.model,
        sourceRequestId: requestId,
        sourceUsage: { ...result.usage },
        createdAt,
        expiresAt: createdAt + this.cacheTtlMs,
        cacheType: 'exact',
      };
      this.cache.set(storedEntry);
    }

    const telemetry: RequestTelemetry = {
      requestId,
      timestamp: requestTimestamp,
      provider: request.provider,
      model: request.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      thinkingTokens: result.usage.thinkingTokens,
      totalTokens: result.usage.totalTokens,
      latencyMs: responseLatencyMs,
      cacheHit: false,
      cacheType: null,
      cacheEligible: policy.eligible && result.cacheable,
      cacheBypassReason: policy.reason ?? (result.cacheable ? null : 'incomplete_provider_response'),
      responseSource: 'provider',
      sourceProvider: request.provider,
      sourceModel: request.model,
      sourceRequestId: requestId,
      cacheEntryId: storedEntry?.id ?? null,
      cacheLookupLatencyMs,
      sourceInputTokens: result.usage.inputTokens,
      sourceOutputTokens: result.usage.outputTokens,
      sourceThinkingTokens: result.usage.thinkingTokens,
      sourceTotalTokens: result.usage.totalTokens,
      avoidedEstimatedTokens: null,
      avoidedEstimatedApiCost: null,
      compressionUsed: false,
      compressionRatio: null,
      validatorPassed: null,
      escalated: false,
      routerPolicy: null,
      routerConfidence: null,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
    };

    return this.toResponse(result.content, request.provider, request.model, telemetry);
  }

  private toResponse(
    content: string,
    provider: string,
    model: string,
    telemetry: RequestTelemetry,
  ): ChatApiResponse {
    return {
      message: { role: 'assistant', content },
      provider,
      model,
      telemetry,
      metrics: {
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        thinkingTokens: telemetry.thinkingTokens,
        totalTokens: telemetry.totalTokens,
        latencyMs: telemetry.latencyMs,
      },
    };
  }
}
