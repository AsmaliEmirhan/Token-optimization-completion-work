import { InMemoryExactCache } from './exactCache.js';
import { ChatService, type ChatServiceOptions } from '../chat/chatService.js';
import type { CacheScope, ExactCacheEntry, SecurityScope } from './cacheTypes.js';
import { createClassificationOverhead, validation,
  type SemanticPrivacyClassifier } from './cacheValidation.js';
import type { ChatApiRequest, LLMProvider, LLMResponse } from '../../types/api.js';

// Tamamı sentetik fixture; bu yardımcı gerçek sağlayıcıya veya ücretli doğrulayıcıya bağlanmaz.
export const scopeA: SecurityScope = { partitionId: 'server-partition-a', credentialRevision: 1 };
export const scopeB: SecurityScope = { partitionId: 'server-partition-b', credentialRevision: 1 };
export const baseRequest: ChatApiRequest = { provider: 'openai', model: 'gpt-4o', message: 'Deney için genel bir soru' };
export const result = (): LLMResponse => ({
  content: 'Kısa deney cevabı.', cacheable: true, latencyMs: 5,
  safety: { complete: true, hasToolCalls: false, hasRetrieval: false, hasPrivateContext: false, flagged: false },
  usage: { inputTokens: 10, outputTokens: 20, thinkingTokens: 0, totalTokens: 30 },
});

// Yalnız testlerde açıkça kullanılan sentetik sınıflandırıcı; üretim uygulaması bunu yüklemez.
export const mockPublicClassifier: SemanticPrivacyClassifier = {
  version: 'mock-public-v1',
  async classifyRequest() { return { classification: 'public_shareable', confidence: 0.99,
    reasonCode: 'mock_public', classifierVersion: this.version,
    usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, estimatedCost: 0.00001 } }; },
  async classifyResponse() { return { classification: 'public_shareable', confidence: 0.99,
    reasonCode: 'mock_public', classifierVersion: this.version,
    usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, estimatedCost: 0.00001 } }; },
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function createHarness(options: Partial<Omit<ChatServiceOptions, 'providers' | 'cache'>> & {
  ttlMs?: number; maxEntries?: number; maxEntryBytes?: number; withoutClassifier?: boolean;
} = {}) {
  let now = 1000;
  let calls = 0;
  let behavior = async (): Promise<LLMResponse> => result();
  const provider: LLMProvider = { async sendMessage() { calls++; return behavior(); } };
  const cache = new InMemoryExactCache({ ttlMs: options.ttlMs ?? 1000,
    maxEntries: options.maxEntries ?? 10, maxEntryBytes: options.maxEntryBytes, now: () => now });
  const service = new ChatService({ providers: { openai: provider, gemini: provider, groq: provider },
    cache, cacheTtlMs: options.ttlMs ?? 1000, now: () => now, ...options,
    classifier: options.withoutClassifier ? undefined : options.classifier ?? mockPublicClassifier,
    classifierConsent: options.withoutClassifier ? undefined : true });
  return { cache, service, provider, calls: () => calls, advance: (ms: number) => { now += ms; },
    behavior: (fn: typeof behavior) => { behavior = fn; },
    execute: (overrides: Partial<ChatApiRequest> = {}, scope: SecurityScope | null = scopeA) =>
      service.execute({ ...baseRequest, ...overrides }, { apiKey: 'fake-key', securityScope: scope ?? undefined }),
  };
}

export function mockEntry(key: string, now: number, scope: CacheScope = 'session_private'): ExactCacheEntry {
  const sharing = { ...validation(scope === 'shared' ? 'approved' : 'uncertain', 'test_fixture'),
    classification: scope === 'shared' ? 'public_shareable' as const : 'session_private' as const };
  return {
    id: key, key, answerId: key, content: 'x'.repeat(200), sourceProvider: 'openai', sourceModel: 'gpt-4o',
    sourceRequestId: key, sourceUsage: result().usage, createdAt: now, expiresAt: now + 10000, cacheType: 'exact',
    scope, scopeId: scope === 'shared' ? null : 'test-partition', policyVersion: 'test-policy', validationStatus: sharing.status,
    provenance: { kind: 'provider', validatedAt: now, validatorVersion: sharing.validatorVersion },
    decision: { requestId: key, eligibilityResult: { scope, eligible: true, reasonCode: 'test_fixture',
      policyVersion: 'test-policy', requiresAdditionalValidation: false, category: null, sharing,
      classification: scope === 'shared' ? 'public_shareable' : 'session_private', confidence: 1,
      classificationOverhead: createClassificationOverhead() },
      sharingResult: sharing, reasonCode: 'test_fixture', validatorVersion: sharing.validatorVersion, timestamp: now },
  };
}
