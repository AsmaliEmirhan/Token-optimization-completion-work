import crypto from 'node:crypto';
import { calculateRequestCost, type UsageTokens } from '../cost/costEngine.js';
import { createExactCacheKey } from '../cache/cacheKey.js';
import { evaluateCachePolicy, privateScopeFor } from '../cache/cachePolicy.js';
import { CACHE_POLICY_VERSION, type AuthenticatedIdentity, type CacheScopeDecision,
  type CacheScopeBinding, type ClassificationOverhead, type ExactCacheEntry, type ExactCacheStore,
  type SecurityScope } from '../cache/cacheTypes.js';
import { createClassificationOverhead, validateSharedResponse,
  type SemanticPrivacyClassifier } from '../cache/cacheValidation.js';
import type { ChatApiRequest, ChatApiResponse, LLMProvider, RequestTelemetry, LLMResponse } from '../../types/api.js';
import { validateChatRequest } from './requestValidation.js';

export interface ChatServiceOptions {
  providers: Record<string, LLMProvider>;
  cache: ExactCacheStore;
  cacheTtlMs: number;
  now?: () => number;
  createId?: () => string;
  classifier?: SemanticPrivacyClassifier;
  classifierConsent?: true;
  policyVersion?: string;
  classifierTimeoutMs?: number;
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
    if (options.classifier && options.classifierConsent !== true) throw new Error('CLASSIFIER_CONSENT_REQUIRED');
    if (options.classifier && !/^[a-z0-9_.:-]{1,100}$/i.test(options.classifier.version)) throw new Error('INVALID_CLASSIFIER_VERSION');
    // Yerleşik sürüm özel etiketten bağımsızdır; eski soru kurallarıyla onaylı kayıt okunamaz.
    this.policyVersion = [CACHE_POLICY_VERSION, options.policyVersion ?? 'default',
      options.classifier?.version ?? 'no-semantic-classifier'].join(':');
    options.cache.invalidate({ scope: 'shared', incompatiblePolicyVersion: this.policyVersion });
    options.cache.invalidate({ scope: 'user_private' });
    options.cache.invalidate({ scope: 'session_private' });
    this.timeoutMs = options.providerTimeoutMs ?? 60_000;
    this.maxGenerations = options.maxConcurrentGenerations ?? 100;
    this.maxWaiters = options.maxWaitersPerKey ?? 32;
    for (const value of [this.timeoutMs, this.maxGenerations, this.maxWaiters, options.cacheTtlMs, options.classifierTimeoutMs ?? 1000]) {
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
    const overhead = createClassificationOverhead();
    const policy = await evaluateCachePolicy({ ...policyRequest,
      forceCacheBypass: request.forceCacheBypass || this.options.cacheEnabled === false,
    }, { policyVersion: this.policyVersion, classifier: this.options.classifier,
      classifierTimeoutMs: this.options.classifierTimeoutMs, overhead });
    const keyInput = {
      provider: request.provider, model: request.model, message: request.message,
      systemInstructions: request.systemInstructions ?? null,
      conversation: request.conversation ?? [],
      generationParameters: request.generationParameters ?? {},
      policyVersion: this.policyVersion,
      toolContext: request.toolContext ?? null, retrievalContext: request.retrievalContext ?? null,
    };
    const sharedKey = policy.scope === 'shared' ? createExactCacheKey({ ...keyInput, scope: 'shared', scopeId: null }) : null;
    const inflightKey = sharedKey ? generation + ':' + createExactCacheKey({ ...keyInput,
      ...privateScopeFor(policyRequest) }) : null;
    const lookupStartedAt = performance.now();
    const lookup = (key: string | null, binding: CacheScopeBinding) => {
      if (!key) return null;
      const candidate = this.options.cache.get(key, this.now());
      if (!candidate) return null;
      if (candidate.scope !== binding.scope || candidate.scopeId !== binding.scopeId || candidate.policyVersion !== this.policyVersion ||
          candidate.sourceProvider !== request.provider || candidate.sourceModel !== request.model ||
          (binding.scope === 'shared' && (candidate.validationStatus !== 'approved' ||
            candidate.decision?.sharingResult?.status !== 'approved' ||
            candidate.decision.sharingResult.classification !== 'public_shareable' ||
            candidate.decision?.eligibilityResult?.scope !== 'shared' ||
            candidate.decision.eligibilityResult.sharing?.status !== 'approved' || !candidate.decision.eligibilityResult.eligible ||
            candidate.decision.eligibilityResult.classification !== 'public_shareable' ||
            candidate.decision.eligibilityResult.policyVersion !== this.policyVersion))) {
        this.options.cache.delete(key); return null;
      }
      return candidate;
    };
    // Özel kayıt hiçbir zaman okunmaz; eski kayıtlar kurucu tarafından da temizlenir.
    const entry = lookup(sharedKey, { scope: 'shared', scopeId: null });
    const lookupLatency = sharedKey ? Number((performance.now() - lookupStartedAt).toFixed(3)) : null;
    const base: RequestTelemetry = {
      requestId, timestamp, provider: request.provider, model: request.model,
      inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null,
      latencyMs: 0, cacheHit: false, cacheType: null, cacheEligible: policy.eligible,
      cacheScope: policy.scope, cacheDecisionReason: policy.reasonCode, cachePolicyVersion: this.policyVersion,
      privacyClassification: policy.classification, privacyConfidence: policy.confidence,
      ...this.classificationTelemetry(overhead, 0, 0),
      cacheValidationStatus: policy.sharing.status,
      cacheBypassReason: policy.eligible ? null : policy.reasonCode, cacheStatus: policy.eligible ? 'miss' : 'bypass',
      cacheWriteReason: null, cacheInfrastructureCost: null,
      responseSource: 'provider', sourceProvider: request.provider, sourceModel: request.model,
      sourceRequestId: requestId, cacheEntryId: null, cacheLookupLatencyMs: lookupLatency,
      sourceInputTokens: null, sourceOutputTokens: null, sourceThinkingTokens: null, sourceTotalTokens: null,
      avoidedEstimatedTokens: null, avoidedEstimatedApiCost: null,
      netAvoidedEstimatedTokens: null, netAvoidedEstimatedApiCost: null,
      compressionUsed: false, compressionRatio: null, validatorPassed: null, escalated: false,
      routerPolicy: null, routerConfidence: null, inputCost: null, outputCost: null, totalCost: null,
    };
    if (entry) {
      const cost = calculateRequestCost(entry.sourceProvider, entry.sourceModel, entry.sourceUsage);
      return this.reusedResponse(entry.content, { ...base, cacheScope: entry.scope,
        cacheValidationStatus: entry.validationStatus, cacheDecisionReason: entry.decision.reasonCode },
        startedAt, 'shared_l1_cache', {
        sourceProvider: entry.sourceProvider, sourceModel: entry.sourceModel, sourceRequestId: entry.sourceRequestId,
        cacheEntryId: entry.id, sourceInputTokens: entry.sourceUsage.inputTokens,
        sourceOutputTokens: entry.sourceUsage.outputTokens, sourceThinkingTokens: entry.sourceUsage.thinkingTokens,
        sourceTotalTokens: entry.sourceUsage.totalTokens, avoidedEstimatedApiCost: cost.totalCost,
      });
    }

    // Paylaşım onayı üretimden sonra verilir. Bu yüzden ortak adaylar dahi farklı oturumlarda
    // aynı in-flight sonuca bağlanmaz; doğrulanmamış bir cevap kullanıcılar arasında sızamaz.
    const pending = inflightKey ? this.inflight.get(inflightKey) : undefined;
    if (pending) {
      if (pending.waiters >= this.maxWaiters) throw new Error('CAPACITY_EXCEEDED');
      pending.waiters++;
      try {
        // Aynı kapsamlı istekleri tek üretimde birleştiriyoruz; maliyet ilk isteğin üzerinde kalır.
        const source = await pending.promise;
        return this.reusedResponse(source.message.content, { ...base,
          cacheScope: source.telemetry.cacheScope, cacheEligible: source.telemetry.cacheEligible,
          cacheValidationStatus: source.telemetry.cacheValidationStatus,
          cacheBypassReason: source.telemetry.cacheBypassReason,
          privacyClassification: source.telemetry.privacyClassification,
          privacyConfidence: source.telemetry.privacyConfidence,
          cacheDecisionReason: source.telemetry.cacheEligible ? 'inflight_session' : source.telemetry.cacheDecisionReason,
        }, startedAt, 'inflight_shared', {
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
      { sharedKey, policy, overhead }, generation);
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
    context: { sharedKey: string | null; policy: CacheScopeDecision; overhead: ClassificationOverhead },
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
    if (context.sharedKey) {
      sharing = await validateSharedResponse(request, result, this.options.classifier,
        context.overhead, this.options.classifierTimeoutMs);
      if (sharing.status !== 'approved') writeReason = sharing.reasonCode;
    }
    if (context.sharedKey && sharing.status === 'approved') {
      if (generation !== this.options.cache.generation) writeReason = 'cache_invalidated';
      else {
        const createdAt = this.now();
        const candidate: ExactCacheEntry = {
          id: this.createId(), key: context.sharedKey, answerId: this.createId(), content: result.content,
          sourceProvider: request.provider, sourceModel: request.model, sourceRequestId: base.requestId,
          sourceUsage: usage, createdAt, expiresAt: createdAt + this.options.cacheTtlMs, cacheType: 'exact',
          scope: 'shared', scopeId: null, policyVersion: this.policyVersion, validationStatus: sharing.status,
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
      ...this.classificationTelemetry(context.overhead, cost.totalCost, usage.totalTokens),
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      cacheEntryId: storedEntry?.id ?? null, cacheWriteReason: writeReason,
      cacheScope: context.sharedKey && sharing.status === 'approved' ? 'shared' : null, cacheValidationStatus: sharing.status,
      cacheEligible: context.sharedKey !== null && sharing.status === 'approved',
      cacheBypassReason: sharing.status === 'approved' ? null : sharing.reasonCode,
      privacyClassification: sharing.classification ?? context.policy.classification,
      privacyConfidence: sharing.confidence ?? context.policy.confidence,
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
      netAvoidedEstimatedTokens: provenance.sourceTotalTokens === null || base.classifierTotalTokens === null ? null :
        provenance.sourceTotalTokens - base.classifierTotalTokens,
      netAvoidedEstimatedApiCost: provenance.avoidedEstimatedApiCost === null || base.classifierEstimatedCost === null ? null :
        provenance.avoidedEstimatedApiCost - base.classifierEstimatedCost,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
  }

  private classificationTelemetry(overhead: ClassificationOverhead, providerCost: number | null,
    providerTokens: number | null): Pick<RequestTelemetry, 'classifierCalls' | 'classifierInputTokens' |
      'classifierOutputTokens' | 'classifierTotalTokens' | 'classifierLatencyMs' | 'classifierEstimatedCost' |
      'pipelineTotalTokens' | 'pipelineTotalCost'> {
    return {
      classifierCalls: overhead.calls, classifierInputTokens: overhead.inputTokens,
      classifierOutputTokens: overhead.outputTokens, classifierTotalTokens: overhead.totalTokens,
      classifierLatencyMs: overhead.latencyMs, classifierEstimatedCost: overhead.estimatedCost,
      pipelineTotalTokens: overhead.totalTokens === null || providerTokens === null ? null :
        providerTokens + overhead.totalTokens,
      pipelineTotalCost: overhead.estimatedCost === null || providerCost === null ? null :
        overhead.estimatedCost + providerCost,
    };
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
