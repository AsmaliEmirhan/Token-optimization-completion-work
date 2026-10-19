import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from '../chat/chatService.js';
import { createExactCacheKey } from './cacheKey.js';
import { evaluateCachePolicy, privateScopeFor } from './cachePolicy.js';
import { createClassificationOverhead, type SemanticPrivacyClassifier } from './cacheValidation.js';
import { baseRequest, createHarness, mockEntry, mockPublicClassifier, result, scopeA, scopeB } from './cacheTestUtils.js';
import { InMemoryExactCache } from './exactCache.js';

test('semantik sınıflandırıcı yoksa sıradan soru belirsizdir ve hiçbir kapsamda saklanmaz', async () => {
  const h = createHarness({ withoutClassifier: true });
  const input = { message: 'Herhangi bir olgusal sorunun cevabı nedir?' };
  for (const scope of [scopeA, scopeA, scopeB]) {
    const response = await h.execute(input, scope);
    assert.equal(response.telemetry.privacyClassification, 'uncertain');
    assert.equal(response.telemetry.cacheStatus, 'bypass');
    assert.equal(response.telemetry.cacheDecisionReason, 'semantic_classifier_unavailable');
    assert.equal(response.telemetry.responseSource, 'provider');
  }
  assert.equal(h.calls(), 3);
  assert.equal(h.cache.size, 0);
});

test('açıkça etkin mock sınıflandırıcının iki onayından sonra A→B Shared Hit oluşur', async () => {
  const h = createHarness();
  const a = await h.execute({ message: 'Deney sorusu A' });
  const b = await h.execute({ message: 'Deney sorusu A' }, scopeB);
  assert.equal(a.telemetry.cacheStatus, 'miss');
  assert.equal(a.telemetry.cacheScope, 'shared');
  assert.equal(a.telemetry.privacyClassification, 'public_shareable');
  assert.equal(a.telemetry.classifierCalls, 2);
  assert.equal(a.telemetry.classifierTotalTokens, 6);
  assert.equal(a.telemetry.pipelineTotalTokens, 36);
  assert.equal(a.telemetry.pipelineTotalCost, a.telemetry.totalCost! + 0.00002);
  assert.equal(b.telemetry.responseSource, 'shared_l1_cache');
  assert.equal(b.telemetry.classifierCalls, 1);
  assert.equal(b.telemetry.classifierTotalTokens, 3);
  assert.equal(b.telemetry.pipelineTotalTokens, 3);
  assert.equal(b.telemetry.pipelineTotalCost, 0.00001);
  assert.deepEqual([b.telemetry.totalTokens, b.telemetry.totalCost], [0, 0]);
  assert.equal(b.telemetry.netAvoidedEstimatedTokens, 27);
  assert.equal(b.telemetry.netAvoidedEstimatedApiCost, a.telemetry.totalCost! - 0.00001);
  assert.equal(b.telemetry.sourceRequestId, a.telemetry.requestId);
  assert.notEqual(b.telemetry.requestId, a.telemetry.requestId);
  assert.equal(h.calls(), 1);
  assert.equal(h.cache.size, 1);
});

test('ham soru, sağlayıcı, model, ayar ve bağlam anahtarı bağımsızdır', async () => {
  const h = createHarness();
  await h.execute();
  for (const variant of [{ message: baseRequest.message + ' ' }, { provider: 'gemini' },
    { provider: 'groq' }, { model: 'other-model' }, { generationParameters: { temperature: 0.4 } }]) {
    assert.equal((await h.execute(variant, scopeB)).telemetry.cacheStatus, 'miss');
  }
  assert.equal(h.calls(), 6);
  const decision = await evaluateCachePolicy({ ...baseRequest, securityScope: scopeA },
    { classifier: mockPublicClassifier, overhead: createClassificationOverhead() });
  assert.equal(decision.classification, 'public_shareable');
  const key = createExactCacheKey({ ...baseRequest, scope: 'shared', scopeId: null,
    policyVersion: decision.policyVersion, systemInstructions: null, conversation: [],
    generationParameters: {}, toolContext: null, retrievalContext: null });
  assert.equal(key, createExactCacheKey({ ...baseRequest, scope: 'shared', scopeId: null,
    policyVersion: decision.policyVersion, systemInstructions: null, conversation: [],
    generationParameters: {}, toolContext: null, retrievalContext: null }));
  assert.notEqual(key, createExactCacheKey({ ...baseRequest, ...privateScopeFor({ ...baseRequest, securityScope: scopeA }),
    policyVersion: decision.policyVersion, systemInstructions: null, conversation: [],
    generationParameters: {}, toolContext: null, retrievalContext: null }));
});

test('kullanıcı/oturum özel istekleri, kimlik ve geçmiş değişse de cache yazmaz', async () => {
  const h = createHarness();
  const personal = { message: 'Benim hesabımdaki tutar ne?' };
  for (const scope of [scopeA, scopeA, scopeB]) {
    const answer = await h.execute(personal, scope);
    assert.equal(answer.telemetry.privacyClassification, 'session_private');
    assert.equal(answer.telemetry.cacheStatus, 'bypass');
  }
  const identity = { authenticated: true as const, issuer: 'mock-auth', subject: 'person', cacheRevision: 1 };
  const authenticated = await h.service.execute(baseRequest, { apiKey: 'fake', securityScope: scopeA, authenticatedIdentity: identity });
  assert.equal(authenticated.telemetry.privacyClassification, 'user_private');
  assert.equal(authenticated.telemetry.cacheStatus, 'bypass');
  const history = await h.execute({ conversation: [{ role: 'user', content: 'Önceki mesaj' }] });
  assert.equal(history.telemetry.privacyClassification, 'session_private');
  assert.equal(history.telemetry.cacheStatus, 'bypass');
  assert.equal(h.cache.size, 0);
});

test('semantik sınıflandırıcı anahtar sözcük taşımayan isteği de özel işaretleyebilir', async () => {
  const classifier: SemanticPrivacyClassifier = { ...mockPublicClassifier, version: 'mock-private-v1',
    async classifyRequest() { return { classification: 'user_private', confidence: 0.99,
      reasonCode: 'fixture_private', classifierVersion: this.version,
      usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, estimatedCost: 0.00001 } }; } };
  const h = createHarness({ classifier });
  const first = await h.execute({ message: 'Bu sonucu yorumlar mısın?' });
  const second = await h.execute({ message: 'Bu sonucu yorumlar mısın?' }, scopeB);
  assert.equal(first.telemetry.privacyClassification, 'user_private');
  assert.equal(first.telemetry.cacheDecisionReason, 'classifier_user_private');
  assert.equal(first.telemetry.cacheStatus, 'bypass');
  assert.equal(second.telemetry.responseSource, 'provider');
  assert.equal(h.cache.size, 0);
});

test('yanıt onayı reddedilirse veya belirsizse özel cache bile yazılmaz', async () => {
  for (const classification of ['sensitive', 'uncertain'] as const) {
    const classifier: SemanticPrivacyClassifier = { ...mockPublicClassifier, version: 'mock-' + classification,
      async classifyResponse() { return { classification, confidence: 0.99,
        reasonCode: 'mock_' + classification, classifierVersion: this.version,
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, estimatedCost: 0.00001 } }; } };
    const h = createHarness({ classifier });
    const a = await h.execute();
    const b = await h.execute({}, scopeB);
    assert.equal(a.telemetry.cacheScope, null);
    assert.equal(a.telemetry.privacyClassification, classification);
    assert.equal(b.telemetry.responseSource, 'provider');
    assert.equal(h.cache.size, 0);
    assert.equal(h.calls(), 2);
  }
});

test('sınıflandırıcı açık rıza ayarı olmadan başlatılamaz', () => {
  const cache = new InMemoryExactCache({ maxEntries: 10, ttlMs: 1000 });
  assert.throws(() => new ChatService({ providers: {}, cache, cacheTtlMs: 1000,
    classifier: mockPublicClassifier }), /CLASSIFIER_CONSENT_REQUIRED/);
});

test('eski politika sürümündeki paylaşılan kayıt açılışta silinir', async () => {
  const cache = new InMemoryExactCache({ maxEntries: 10, ttlMs: 1000, now: () => 1000 });
  const old = mockEntry('old', 1000, 'shared');
  assert.equal(cache.set(old), true);
  const provider = { async sendMessage() { return result(); } };
  const service = new ChatService({ providers: { openai: provider }, cache, cacheTtlMs: 1000,
    now: () => 1000, classifier: mockPublicClassifier, classifierConsent: true });
  assert.equal(cache.size, 0);
  const current = await service.execute(baseRequest, { apiKey: 'fake', securityScope: scopeA });
  assert.equal(current.telemetry.cacheStatus, 'miss');
  assert.match(current.telemetry.cachePolicyVersion, /^privacy-general-v1:/);
});
