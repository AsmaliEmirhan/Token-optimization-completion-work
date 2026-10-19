import crypto from 'node:crypto';
import { calculateRequestCost, type UsageTokens } from '../cost/costEngine.js';
import { createExactCacheKey } from '../cache/cacheKey.js';
import { evaluateCachePolicy, privateScopeFor } from '../cache/cachePolicy.js';
import { CACHE_POLICY_VERSION, type AuthenticatedIdentity, type CacheScopeBinding, type CacheScopeDecision,
  type ExactCacheEntry, type ExactCacheStore, type SecurityScope } from '../cache/cacheTypes.js';
import { inspectTextRisk, validateSharedResponse, type CacheSafetyValidator } from '../cache/cacheValidation.js';
import type { ChatApiRequest, ChatApiResponse, LLMProvider, RequestTelemetry, LLMResponse } from '../../types/api.js';
import { validateChatRequest } from './requestValidation.js';

export interface ChatServiceOptions {
  providers: Record<string, LLMProvider>;
  cache: ExactCacheStore;
  cacheTtlMs: number;
  now?: () => number;
  createId?: () => string;
  validator?: CacheSafetyValidator;
  policyVersion?: string;
  validatorTimeoutMs?: number;
  providerTimeoutMs?: number;
  maxConcurrentGenerations?: number;
  maxWaitersPerKey?: number;
  cacheEnabled?: boolean;
}

export interface ExecuteChatOptions {
  apiKey: string;
  securityScope?: SecurityScope;
  authenticatedIdentity?: AuthenticatedIdentity;
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
  private readonly policyVersion: string;
  private readonly inflight = new Map<string, InflightEntry>();
  private activeGenerations = 0;
  private activeRequests = 0;
  private readonly timeoutMs: number;
  private readonly maxGenerations: number;
  private readonly maxWaiters: number;

  constructor(options: ChatServiceOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? crypto.randomUUID;
    if (options.validator && !/^[a-z0-9_.:-]{1,100}$/i.test(options.validator.version)) throw new Error('INVALID_VALIDATOR_VERSION');
    // Doğrulayıcı sürümü de politikaya bağlıdır; değişen kurallar eski ortak kayıtları okuyamaz.
    this.policyVersion = (options.policyVersion ?? CACHE_POLICY_VERSION) + ':' + (options.validator?.version ?? 'no-additional-validator');
    options.cache.invalidate({ scope: 'shared', incompatiblePolicyVersion: this.policyVersion });
    this.timeoutMs = options.providerTimeoutMs ?? 60_000;
    this.maxGenerations = options.maxConcurrentGenerations ?? 100;
    this.maxWaiters = options.maxWaitersPerKey ?? 32;
    for (const value of [this.timeoutMs, this.maxGenerations, this.maxWaiters, options.cacheTtlMs, options.validatorTimeoutMs ?? 1000]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID_CHAT_LIMIT');
    }
  }

  get inflightCount(): number { return this.inflight.size; }

  async execute(input: ChatApiRequest, options: ExecuteChatOptions): Promise<ChatApiResponse> {
    const request = validateChatRequest(input);
    // Ek doğrulama da kaynak tüketir; henüz sağlayıcıya ulaşmayan istekler sınırsız birikemez.
    if (this.activeRequests >= this.maxGenerations * (this.maxWaiters + 1)) throw new Error('CAPACITY_EXCEEDED');
    this.activeRequests++;
    try { return await this.executeValidated(request, options); }
    finally { this.activeRequests--; }
  }

  private async executeValidated(request: ChatApiRequest, options: ExecuteChatOptions): Promise<ChatApiResponse> {
    const providerService = Object.hasOwn(this.options.providers, request.provider) ? this.options.providers[request.provider] : undefined;
    if (!providerService) throw new Error('UNKNOWN_PROVIDER');
    const startedAt = performance.now();
    const requestId = options.requestId ?? this.createId();
    const timestamp = this.now();
    const generation = this.options.cache.generation;
    const policyRequest = { ...request, securityScope: options.securityScope, authenticatedIdentity: options.authenticatedIdentity };
    const privateBinding = privateScopeFor(policyRequest);
    const policy = await evaluateCachePolicy({ ...policyRequest,
      forceCacheBypass: request.forceCacheBypass || this.options.cacheEnabled === false,
    }, { policyVersion: this.policyVersion, validator: this.options.validator, validatorTimeoutMs: this.options.validatorTimeoutMs });
    const keyInput = {
      provider: request.provider, model: request.model, message: request.message,
      systemInstructions: request.systemInstructions ?? null,
      conversation: request.conversation ?? [],
      generationParameters: request.generationParameters ?? {},
      policyVersion: this.policyVersion,
      toolContext: request.toolContext ?? null, retrievalContext: request.retrievalContext ?? null,
    };
    const privateKey = policy.eligible ? createExactCacheKey({ ...keyInput, ...privateBinding }) : null;
    const sharedKey = policy.scope === 'shared' ? createExactCacheKey({ ...keyInput, scope: 'shared', scopeId: null }) : null;
    const lookupStartedAt = performance.now();
    const lookup = (key: string | null, binding: CacheScopeBinding) => {
      if (!key) return null;
      const candidate = this.options.cache.get(key, this.now());
      if (!candidate) return null;
      if (candidate.scope !== binding.scope || candidate.scopeId !== binding.scopeId || candidate.policyVersion !== this.policyVersion ||
          candidate.sourceProvider !== request.provider || candidate.sourceModel !== request.model ||
          (binding.scope === 'shared' && (candidate.validationStatus !== 'approved' ||
            candidate.decision?.sharingResult?.status !== 'approved' || candidate.decision?.eligibilityResult?.scope !== 'shared' ||
            candidate.decision.eligibilityResult.sharing?.status !== 'approved' || !candidate.decision.eligibilityResult.eligible ||
            candidate.decision.eligibilityResult.policyVersion !== this.policyVersion))) {
        this.options.cache.delete(key); return null;
      }
      return candidate;
    };
    // Ortak arama yalnız onaydan sonra yapılır. Özel kayıt okunabilir ama asla ortak kayda dönüştürülmez.
    const entry = lookup(sharedKey, { scope: 'shared', scopeId: null }) ?? lookup(privateKey, privateBinding);
    const lookupLatency = privateKey ? Number((performance.now() - lookupStartedAt).toFixed(3)) : null;
    const base: RequestTelemetry = {
      requestId, timestamp, provider: request.provider, model: request.model,
      inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null,
      latencyMs: 0, cacheHit: false, cacheType: null, cacheEligible: policy.eligible,
      cacheScope: policy.scope, cacheDecisionReason: policy.reasonCode, cachePolicyVersion: this.policyVersion,
      cacheValidationStatus: policy.sharing.status,
      cacheBypassReason: policy.eligible ? null : policy.reasonCode, cacheStatus: policy.eligible ? 'miss' : 'bypass',
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
      return this.reusedResponse(entry.content, { ...base, cacheScope: entry.scope,
        cacheValidationStatus: entry.validationStatus, cacheDecisionReason: entry.decision.reasonCode },
        startedAt, entry.scope === 'shared' ? 'shared_l1_cache' : 'private_l1_cache', {
        sourceProvider: entry.sourceProvider, sourceModel: entry.sourceModel, sourceRequestId: entry.sourceRequestId,
        cacheEntryId: entry.id, sourceInputTokens: entry.sourceUsage.inputTokens,
        sourceOutputTokens: entry.sourceUsage.outputTokens, sourceThinkingTokens: entry.sourceUsage.thinkingTokens,
        sourceTotalTokens: entry.sourceUsage.totalTokens, avoidedEstimatedApiCost: cost.totalCost,
      });
    }

    // Paylaşım onayı üretimden sonra verilir. Bu yüzden ortak adaylar dahi farklı oturumlarda
    // aynı in-flight sonuca bağlanmaz; doğrulanmamış bir cevap kullanıcılar arasında sızamaz.
    const inflightKey = privateKey ? generation + ':' + privateKey : null;
    const pending = inflightKey ? this.inflight.get(inflightKey) : undefined;
    if (pending) {
      if (pending.waiters >= this.maxWaiters) throw new Error('CAPACITY_EXCEEDED');
      pending.waiters++;
      try {
        // Aynı kapsamlı istekleri tek üretimde birleştiriyoruz; maliyet ilk isteğin üzerinde kalır.
        const source = await pending.promise;
        return this.reusedResponse(source.message.content, { ...base, cacheScope: privateBinding.scope,
          cacheValidationStatus: source.telemetry.cacheValidationStatus, cacheDecisionReason: 'inflight_private_scope' }, startedAt, 'inflight_shared', {
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
    const promise = this.generate(request, options.apiKey, providerService, base, startedAt,
      { privateKey, sharedKey, privateBinding, policy }, generation);
    if (inflightKey) this.inflight.set(inflightKey, { promise, waiters: 0 });
    try {
      return await promise;
    } finally {
      this.activeGenerations--;
      if (inflightKey) this.inflight.delete(inflightKey);
    }
  }

  private async generate(request: ChatApiRequest, apiKey: string, provider: LLMProvider,
    base: RequestTelemetry, startedAt: number,
    context: { privateKey: string | null; sharedKey: string | null; privateBinding: CacheScopeBinding; policy: CacheScopeDecision },
    generation: number): Promise<ChatApiResponse> {
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
    let sharing = context.policy.sharing;
    let binding: CacheScopeBinding = context.privateBinding;
    let cacheKey = context.privateKey;
    if (context.sharedKey) {
      sharing = await validateSharedResponse(request, result, this.options.validator, this.options.validatorTimeoutMs);
      if (sharing.status === 'approved') { cacheKey = context.sharedKey; binding = { scope: 'shared', scopeId: null }; }
      else writeReason = sharing.reasonCode;
    }
    if (cacheKey) {
      const risk = inspectTextRisk(result.content);
      if (result.cacheable !== true || !result.content.trim()) writeReason = 'incomplete_provider_response';
      // Ortak adayda beklenmeyen özel bağlam, anahtarda temsil edilmediği için özel kayda da yazılmaz.
      else if (result.safety && (!result.safety.complete || result.safety.hasToolCalls || result.safety.hasRetrieval ||
        result.safety.flagged || (context.sharedKey && result.safety.hasPrivateContext))) writeReason = 'unsafe_response_metadata';
      else if (risk && risk !== 'personal_context' && risk !== 'conversation_dependent') writeReason = 'response_' + risk;
      else if (generation !== this.options.cache.generation) writeReason = 'cache_invalidated';
      else {
        const createdAt = this.now();
        const candidate: ExactCacheEntry = {
          id: this.createId(), key: cacheKey, answerId: this.createId(), content: result.content,
          sourceProvider: request.provider, sourceModel: request.model, sourceRequestId: base.requestId,
          sourceUsage: usage, createdAt, expiresAt: createdAt + this.options.cacheTtlMs, cacheType: 'exact',
          ...binding, policyVersion: this.policyVersion, validationStatus: sharing.status,
          provenance: { kind: 'provider', validatedAt: createdAt, validatorVersion: sharing.validatorVersion },
          decision: { requestId: base.requestId, eligibilityResult: context.policy, sharingResult: sharing,
            reasonCode: context.sharedKey && sharing.status !== 'approved' ? sharing.reasonCode : context.policy.reasonCode,
            validatorVersion: sharing.validatorVersion, timestamp: createdAt },
        };
        if (this.options.cache.set(candidate)) storedEntry = candidate;
        else writeReason = 'entry_not_stored';
      }
    }
    return this.toResponse(result.content, {
      ...base, ...usage, inputCost: cost.inputCost, outputCost: cost.outputCost, totalCost: cost.totalCost,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      cacheEntryId: storedEntry?.id ?? null, cacheWriteReason: writeReason,
      cacheScope: cacheKey ? binding.scope : null, cacheValidationStatus: sharing.status,
      cacheDecisionReason: context.sharedKey && sharing.status !== 'approved' ? sharing.reasonCode : base.cacheDecisionReason,
      validatorPassed: context.sharedKey ? sharing.status === 'approved' : null,
      sourceInputTokens: usage.inputTokens, sourceOutputTokens: usage.outputTokens,
      sourceThinkingTokens: usage.thinkingTokens, sourceTotalTokens: usage.totalTokens,
    });
  }

  private reusedResponse(content: string, base: RequestTelemetry, startedAt: number,
    source: 'shared_l1_cache' | 'private_l1_cache' | 'inflight_shared',
    provenance: Pick<RequestTelemetry, 'sourceProvider' | 'sourceModel' | 'sourceRequestId' | 'cacheEntryId' |
      'sourceInputTokens' | 'sourceOutputTokens' | 'sourceThinkingTokens' | 'sourceTotalTokens' | 'avoidedEstimatedApiCost'>): ChatApiResponse {
    // Kaynak tokenlar geçmiş/ortak üretime aittir; yeni isteğin gerçek tüketimine eklenmez.
    return this.toResponse(content, {
      ...base, ...provenance, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0,
      inputCost: 0, outputCost: 0, totalCost: 0, responseSource: source,
      cacheHit: source !== 'inflight_shared', cacheType: source !== 'inflight_shared' ? 'exact' : null,
      cacheStatus: source !== 'inflight_shared' ? 'hit' : 'inflight_shared',
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
