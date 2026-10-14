import crypto from 'node:crypto';
import { calculateRequestCost, type UsageTokens } from '../cost/costEngine.js';
import { createExactCacheKey } from '../cache/cacheKey.js';
import { evaluateCachePolicy, DEFAULT_SAFE_FINGERPRINTS } from '../cache/cachePolicy.js';
import type { ExactCacheEntry, ExactCacheStore, SecurityScope } from '../cache/cacheTypes.js';
import type { ChatApiRequest, ChatApiResponse, LLMProvider, RequestTelemetry, LLMResponse } from '../../types/api.js';
import { validateChatRequest } from './requestValidation.js';

export interface ChatServiceOptions {
  providers: Record<string, LLMProvider>;
  cache: ExactCacheStore;
  cacheTtlMs: number;
  now?: () => number;
  createId?: () => string;
  approvedFingerprints?: ReadonlySet<string>;
  providerTimeoutMs?: number;
  maxConcurrentGenerations?: number;
  maxWaitersPerKey?: number;
  cacheEnabled?: boolean;
}

export interface ExecuteChatOptions {
  apiKey: string;
  securityScope?: SecurityScope;
  requestId?: string;
}

interface InflightEntry {
  promise: Promise<ChatApiResponse>;
  waiters: number;
}

export class ChatService {
  private readonly options: ChatServiceOptions;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly approved: ReadonlySet<string>;
  private readonly inflight = new Map<string, InflightEntry>();
  private activeGenerations = 0;
  private readonly timeoutMs: number;
  private readonly maxGenerations: number;
  private readonly maxWaiters: number;

  constructor(options: ChatServiceOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? crypto.randomUUID;
    this.approved = new Set(options.approvedFingerprints ?? DEFAULT_SAFE_FINGERPRINTS);
    this.timeoutMs = options.providerTimeoutMs ?? 60_000;
    this.maxGenerations = options.maxConcurrentGenerations ?? 100;
    this.maxWaiters = options.maxWaitersPerKey ?? 32;
    for (const value of [this.timeoutMs, this.maxGenerations, this.maxWaiters, options.cacheTtlMs]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID_CHAT_LIMIT');
    }
  }

  get inflightCount(): number { return this.inflight.size; }

  async execute(input: ChatApiRequest, options: ExecuteChatOptions): Promise<ChatApiResponse> {
    const request = validateChatRequest(input);
    const providerService = Object.hasOwn(this.options.providers, request.provider) ? this.options.providers[request.provider] : undefined;
    if (!providerService) throw new Error('UNKNOWN_PROVIDER');
    const startedAt = performance.now();
    const requestId = options.requestId ?? this.createId();
    const timestamp = this.now();
    const keyInput = {
      provider: request.provider, model: request.model, message: request.message,
      systemInstructions: request.systemInstructions ?? null,
      conversation: request.conversation ?? [],
      generationParameters: request.generationParameters ?? {},
      // Oturum kimliğini istemciden güvenilir kabul etmiyoruz; yalnızca sunucu seçeneklerinden alıyoruz.
      securityScope: options.securityScope ?? { partitionId: '', credentialRevision: 0 },
      toolContext: request.toolContext ?? null, retrievalContext: request.retrievalContext ?? null,
    };
    const policy = evaluateCachePolicy({
      ...keyInput, forceCacheBypass: request.forceCacheBypass || this.options.cacheEnabled === false,
    }, this.approved);
    const generation = this.options.cache.generation;
    const cacheKey = policy.eligible ? createExactCacheKey(keyInput) : null;
    const lookupStartedAt = performance.now();
    const entry = cacheKey ? this.options.cache.get(cacheKey, timestamp) : null;
    const lookupLatency = cacheKey ? Number((performance.now() - lookupStartedAt).toFixed(3)) : null;
    const base: RequestTelemetry = {
      requestId, timestamp, provider: request.provider, model: request.model,
      inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null,
      latencyMs: 0, cacheHit: false, cacheType: null, cacheEligible: policy.eligible,
      cacheBypassReason: policy.reason, cacheStatus: policy.eligible ? 'miss' : 'bypass',
      cacheWriteReason: null, cacheInfrastructureCost: null,
      responseSource: 'provider', sourceProvider: request.provider, sourceModel: request.model,
      sourceRequestId: requestId, cacheEntryId: null, cacheLookupLatencyMs: lookupLatency,
      sourceInputTokens: null, sourceOutputTokens: null, sourceThinkingTokens: null, sourceTotalTokens: null,
      avoidedEstimatedTokens: null, avoidedEstimatedApiCost: null,
      compressionUsed: false, compressionRatio: null, validatorPassed: null, escalated: false,
      routerPolicy: null, routerConfidence: null, inputCost: null, outputCost: null, totalCost: null,
    };
    if (entry) {
      const cost = calculateRequestCost(entry.sourceProvider, entry.sourceModel, entry.sourceUsage);
      return this.reusedResponse(entry.content, base, startedAt, 'l1_exact_cache', {
        sourceProvider: entry.sourceProvider, sourceModel: entry.sourceModel, sourceRequestId: entry.sourceRequestId,
        cacheEntryId: entry.id, sourceInputTokens: entry.sourceUsage.inputTokens,
        sourceOutputTokens: entry.sourceUsage.outputTokens, sourceThinkingTokens: entry.sourceUsage.thinkingTokens,
        sourceTotalTokens: entry.sourceUsage.totalTokens, avoidedEstimatedApiCost: cost.totalCost,
      });
    }

    const inflightKey = cacheKey ? generation + ':' + cacheKey : null;
    const pending = inflightKey ? this.inflight.get(inflightKey) : undefined;
    if (pending) {
      if (pending.waiters >= this.maxWaiters) throw new Error('CAPACITY_EXCEEDED');
      pending.waiters++;
      try {
        // Aynı kapsamlı istekleri tek üretimde birleştiriyoruz; maliyet ilk isteğin üzerinde kalır.
        const source = await pending.promise;
        return this.reusedResponse(source.message.content, base, startedAt, 'inflight_shared', {
          sourceProvider: source.telemetry.provider, sourceModel: source.telemetry.model,
          sourceRequestId: source.telemetry.requestId, cacheEntryId: source.telemetry.cacheEntryId,
          sourceInputTokens: source.telemetry.inputTokens, sourceOutputTokens: source.telemetry.outputTokens,
          sourceThinkingTokens: source.telemetry.thinkingTokens, sourceTotalTokens: source.telemetry.totalTokens,
          avoidedEstimatedApiCost: source.telemetry.totalCost,
        });
      } finally {
        pending.waiters--;
      }
    }
    if (this.activeGenerations >= this.maxGenerations) throw new Error('CAPACITY_EXCEEDED');
    this.activeGenerations++;
    const promise = this.generate(request, options.apiKey, providerService, base, startedAt, cacheKey, generation);
    if (inflightKey) this.inflight.set(inflightKey, { promise, waiters: 0 });
    try {
      return await promise;
    } finally {
      this.activeGenerations--;
      if (inflightKey) this.inflight.delete(inflightKey);
    }
  }

  private async generate(request: ChatApiRequest, apiKey: string, provider: LLMProvider,
    base: RequestTelemetry, startedAt: number, cacheKey: string | null, generation: number): Promise<ChatApiResponse> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: LLMResponse;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('PROVIDER_TIMEOUT'));
          controller.abort();
        }, this.timeoutMs);
      });
      // SDK iptali yanında yarış sınırı da var: bekleyen HTTP istekleri süresiz açık kalmaz.
      result = await Promise.race([
        Promise.resolve().then(() => provider.sendMessage({
          apiKey, model: request.model, message: request.message,
          systemInstructions: request.systemInstructions, conversation: request.conversation,
          generationParameters: request.generationParameters, signal: controller.signal,
        })),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (typeof result.content !== 'string' || Buffer.byteLength(result.content, 'utf8') > 2 * 1024 * 1024) {
      throw new Error('INVALID_PROVIDER_RESPONSE');
    }
    const usage = this.validUsage(result.usage);
    const cost = calculateRequestCost(request.provider, request.model, usage);
    let storedEntry: ExactCacheEntry | null = null;
    let writeReason: string | null = null;
    if (cacheKey) {
      if (!result.cacheable || !result.content) writeReason = 'incomplete_provider_response';
      else if (generation !== this.options.cache.generation) writeReason = 'cache_invalidated';
      else {
        const createdAt = this.now();
        const candidate: ExactCacheEntry = {
          id: this.createId(), key: cacheKey, answerId: this.createId(), content: result.content,
          sourceProvider: request.provider, sourceModel: request.model, sourceRequestId: base.requestId,
          sourceUsage: usage, createdAt, expiresAt: createdAt + this.options.cacheTtlMs, cacheType: 'exact',
        };
        if (this.options.cache.set(candidate)) storedEntry = candidate;
        else writeReason = 'entry_not_stored';
      }
    }
    return this.toResponse(result.content, {
      ...base, ...usage, inputCost: cost.inputCost, outputCost: cost.outputCost, totalCost: cost.totalCost,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      cacheEntryId: storedEntry?.id ?? null, cacheWriteReason: writeReason,
      sourceInputTokens: usage.inputTokens, sourceOutputTokens: usage.outputTokens,
      sourceThinkingTokens: usage.thinkingTokens, sourceTotalTokens: usage.totalTokens,
    });
  }

  private reusedResponse(content: string, base: RequestTelemetry, startedAt: number,
    source: 'l1_exact_cache' | 'inflight_shared',
    provenance: Pick<RequestTelemetry, 'sourceProvider' | 'sourceModel' | 'sourceRequestId' | 'cacheEntryId' |
      'sourceInputTokens' | 'sourceOutputTokens' | 'sourceThinkingTokens' | 'sourceTotalTokens' | 'avoidedEstimatedApiCost'>): ChatApiResponse {
    // Kaynak tokenlar geçmiş/ortak üretime aittir; yeni isteğin gerçek tüketimine eklenmez.
    return this.toResponse(content, {
      ...base, ...provenance, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0,
      inputCost: 0, outputCost: 0, totalCost: 0, responseSource: source,
      cacheHit: source === 'l1_exact_cache', cacheType: source === 'l1_exact_cache' ? 'exact' : null,
      cacheStatus: source === 'l1_exact_cache' ? 'hit' : 'inflight_shared',
      avoidedEstimatedTokens: provenance.sourceTotalTokens,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
  }

  private validUsage(usage: UsageTokens): UsageTokens {
    const valid = (n: unknown): number | null => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
    return { inputTokens: valid(usage?.inputTokens), outputTokens: valid(usage?.outputTokens),
      thinkingTokens: valid(usage?.thinkingTokens), totalTokens: valid(usage?.totalTokens) };
  }

  private toResponse(content: string, telemetry: RequestTelemetry): ChatApiResponse {
    return {
      message: { role: 'assistant', content }, provider: telemetry.provider, model: telemetry.model, telemetry,
      metrics: { inputTokens: telemetry.inputTokens, outputTokens: telemetry.outputTokens,
        thinkingTokens: telemetry.thinkingTokens, totalTokens: telemetry.totalTokens, latencyMs: telemetry.latencyMs },
    };
  }
}
