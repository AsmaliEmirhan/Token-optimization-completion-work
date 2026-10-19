import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from '../chat/chatService.js';
import { createExactCacheKey } from './cacheKey.js';
import { evaluateCachePolicy, privateScopeFor } from './cachePolicy.js';
import { InMemoryExactCache } from './exactCache.js';
import { baseRequest, createHarness, mockEntry, result, scopeA, scopeB } from './cacheTestUtils.js';
import type { CacheSafetyValidator } from './cacheValidation.js';
import type { SafetyValidationResult } from './cacheTypes.js';

test('iki doğrulanmış oturum aynı tam soruyu tek sağlayıcı çağrısıyla paylaşır', async () => {
  const h = createHarness();
  const a = await h.execute();
  const b = await h.execute({}, scopeB);
  assert.equal(a.telemetry.cacheStatus, 'miss');
  assert.equal(a.telemetry.cacheScope, 'shared');
  assert.equal(b.telemetry.responseSource, 'shared_l1_cache');
  assert.equal(b.telemetry.cacheHit, true);
  assert.equal(b.telemetry.cacheType, 'exact');
  assert.equal(h.calls(), 1);
  assert.notEqual(a.telemetry.requestId, b.telemetry.requestId);
  assert.equal(b.telemetry.sourceRequestId, a.telemetry.requestId);
  assert.deepEqual([b.telemetry.totalTokens, b.telemetry.totalCost], [0, 0]);
  assert.deepEqual([b.telemetry.avoidedEstimatedTokens, b.telemetry.avoidedEstimatedApiCost], [30, a.telemetry.totalCost]);
});

test('Türkçe/İngilizce statik kategori örnekleri ve liste dışı ülke aynı akışla paylaşılır', async () => {
  const examples = [
    ["Türkiye'nin başkenti neresidir?", "Türkiye'nin başkenti Ankara'dır."],
    ["Türkiye'nin başkenti", "Türkiye'nin başkenti Ankara'dır."],
    ['Pisagor teoremi nedir?', 'Dik üçgende a² + b² = c². c hipotenüstür.'],
    ["Python'da for döngüsü nasıl çalışır?", '```python\nfor i in range(5):\n    print(i)\n```'],
    ['What is the capital of France?', 'The capital of France is Paris.'],
    ['What is the capital of Norway?', 'The capital of Norway is Oslo.'],
    ["Japonya'nın başkenti nedir?", "Japonya'nın başkenti Tokyo'dur."],
  ];
  for (const [message, content] of examples) {
    const h = createHarness();
    h.behavior(async () => ({ ...result(), content }));
    const first = await h.execute({ message });
    assert.equal(first.telemetry.cacheScope, 'shared', message);
    assert.equal(first.telemetry.cacheValidationStatus, 'approved', message);
    assert.equal((await h.execute({ message }, scopeB)).telemetry.responseSource, 'shared_l1_cache', message);
    assert.equal(h.calls(), 1);
  }
});

test('farklı ifade, ham model ve sağlayıcı L1 kaydını paylaşmaz', async () => {
  const h = createHarness();
  await h.execute();
  for (const change of [{ message: "Türkiye'nin başkenti neresidir?" }, { message: 'Türkiye başkent ne?' },
    { model: 'gpt-4o-2024-08-06' }, { provider: 'gemini' }, { provider: 'groq' }]) {
    assert.equal((await h.execute(change, scopeB)).telemetry.cacheStatus, 'miss');
  }
  assert.equal(h.calls(), 6);
});

test('belirsiz istek güvenilir ek doğrulayıcı olmadan yalnız kendi oturumunda önbelleğe alınır', async () => {
  const h = createHarness();
  const request = { message: 'Bu tasarım fikrini yorumla.' };
  const a = await h.execute(request);
  assert.equal(a.telemetry.cacheScope, 'session_private');
  assert.equal(a.telemetry.cacheValidationStatus, 'uncertain');
  assert.equal(a.telemetry.cacheDecisionReason, 'additional_validator_unavailable');
  assert.equal((await h.execute(request)).telemetry.responseSource, 'private_l1_cache');
  assert.equal((await h.execute(request, scopeB)).telemetry.cacheStatus, 'miss');
  assert.equal(h.calls(), 2);
});

test('özel yanıt daha sonra onaylanabilecek olsa bile okuma sırasında ortak kayda yükseltilmez', async () => {
  const h = createHarness();
  h.behavior(async () => ({ ...result(), content: 'Uzun ve biçimsel olarak doğrulanamayan bir açıklama.' }));
  const first = await h.execute();
  assert.equal(first.telemetry.cacheScope, 'session_private');
  h.behavior(async () => result());
  assert.equal((await h.execute()).telemetry.responseSource, 'private_l1_cache');
  assert.equal(h.cache.size, 1);
  const other = await h.execute({}, scopeB);
  assert.equal(other.telemetry.cacheStatus, 'miss');
  assert.equal(other.telemetry.cacheScope, 'shared');
  assert.equal(h.calls(), 2);
  assert.equal((await h.execute()).telemetry.responseSource, 'shared_l1_cache');
});

test('politika sürümü değişimi ortak kaydı siler ve yeni sürümde miss üretir', async () => {
  const h = createHarness({ policyVersion: 'rules-old' });
  await h.execute();
  assert.equal(h.cache.size, 1);
  const service = new ChatService({ cache: h.cache, providers: { openai: h.provider }, cacheTtlMs: 1000,
    now: () => 1000, policyVersion: 'rules-new' });
  assert.equal(h.cache.size, 0);
  const second = await service.execute(baseRequest, { apiKey: 'fake', securityScope: scopeB });
  assert.equal(second.telemetry.cacheStatus, 'miss');
  assert.match(second.telemetry.cachePolicyVersion, /^rules-new:/);
  assert.equal(h.calls(), 2);
});

test('özel kapsam, kimlik ve politika anahtara girer; ortak anahtar kişisel kimlik taşımaz', async () => {
  const policy = await evaluateCachePolicy({ ...baseRequest, securityScope: scopeA });
  const input = { ...baseRequest, scope: 'shared' as const, scopeId: null, policyVersion: policy.policyVersion,
    systemInstructions: null, conversation: [], generationParameters: {}, toolContext: null, retrievalContext: null };
  const a = createExactCacheKey({ ...input, ...{ securityScope: scopeA, apiKey: 'secret-a' } });
  const b = createExactCacheKey({ ...input, ...{ securityScope: scopeB, apiKey: 'secret-b' } });
  assert.equal(a, b);
  for (const change of [{ policyVersion: 'next' }, { systemInstructions: 'kısa' },
    { conversation: [{ role: 'user' as const, content: 'önceki' }] }, { generationParameters: { seed: 2 } },
    privateScopeFor({ ...baseRequest, securityScope: scopeA })]) {
    assert.notEqual(a, createExactCacheKey({ ...input, ...change }));
  }
  assert.throws(() => createExactCacheKey({ ...input, scopeId: 'private-identifier' }));
});

test('user_private gerçek sunucu auth bağlamı gerektirir; anonim kimlik oturumda kalır', async () => {
  const request = { ...baseRequest, message: 'Benim favori rengim ne?' };
  const anonymous = await evaluateCachePolicy({ ...request, securityScope: scopeA });
  assert.equal(anonymous.scope, 'session_private');
  const identity = { authenticated: true as const, issuer: 'test-auth', subject: 'verified-user', cacheRevision: 1 };
  const h = createHarness();
  const a = await h.service.execute(request, { apiKey: 'fake', securityScope: scopeA, authenticatedIdentity: identity });
  const b = await h.service.execute(request, { apiKey: 'fake', securityScope: scopeB, authenticatedIdentity: identity });
  assert.equal(a.telemetry.cacheScope, 'user_private');
  assert.equal(b.telemetry.responseSource, 'private_l1_cache');
  const c = await h.service.execute(request, { apiKey: 'fake', securityScope: scopeB,
    authenticatedIdentity: { ...identity, subject: 'other-user' } });
  assert.equal(c.telemetry.cacheStatus, 'miss');
  assert.equal(h.calls(), 2);
});

test('ayrı kapsam kapasitesi ve kapsam/politika invalidation sözleşmesi', () => {
  const cache = new InMemoryExactCache({ maxEntries: 10, maxSharedEntries: 1, maxPrivateEntries: 2, ttlMs: 100, now: () => 1000 });
  cache.set(mockEntry('private-1', 1000));
  cache.set(mockEntry('shared-1', 1000, 'shared'));
  cache.set(mockEntry('shared-2', 1000, 'shared'));
  assert.equal(cache.get('shared-1'), null);
  assert.ok(cache.get('private-1'));
  cache.set(mockEntry('private-2', 1000));
  cache.set(mockEntry('private-3', 1000));
  assert.equal(cache.get('private-1'), null);
  assert.ok(cache.get('shared-2'));
  assert.equal(cache.invalidate({ scope: 'session_private', scopeId: 'test-partition' }), 2);
  assert.equal(cache.invalidate({ scope: 'shared', policyVersion: 'test-policy' }), 1);
  assert.equal(cache.size, 0);
});

test('ek doğrulayıcı iki aşamada bağımsız karar verir ve sürümü anahtara dahil olur', async () => {
  let responseCalls = 0;
  const decision = (status: SafetyValidationResult['status']): SafetyValidationResult => ({ status, reasonCode: 'mock_' + status, validatorVersion: 'fixture-v1' });
  const validator: CacheSafetyValidator = {
    version: 'fixture-v1',
    async validateRequest(request) {
      assert.equal(Object.hasOwn(request, 'securityScope'), false);
      assert.equal(Object.hasOwn(request, 'authenticatedIdentity'), false);
      assert.equal(Object.hasOwn(request, 'apiKey'), false);
      return decision(request.message === 'Test fixture genel sorusu' ? 'approved' : 'uncertain');
    },
    async validateResponse(_request, response) {
      responseCalls++;
      return decision(response.content === 'Doğrulanmış test fixture cevabı' ? 'approved' : 'rejected');
    },
  };
  const h = createHarness({ validator });
  h.behavior(async () => ({ ...result(), content: 'Doğrulanmış test fixture cevabı' }));
  const first = await h.execute({ message: 'Test fixture genel sorusu' });
  assert.match(first.telemetry.cachePolicyVersion, /fixture-v1$/);
  assert.equal((await h.execute({ message: 'Test fixture genel sorusu' }, scopeB)).telemetry.responseSource, 'shared_l1_cache');
  assert.equal(responseCalls, 1);
  const rejected = createHarness({ validator });
  rejected.behavior(async () => ({ ...result(), content: 'Onaysız test cevabı' }));
  assert.equal((await rejected.execute({ message: 'Test fixture genel sorusu' })).telemetry.cacheScope, 'session_private');
  assert.equal((await rejected.execute({ message: 'Test fixture genel sorusu' }, scopeB)).telemetry.cacheStatus, 'miss');
});
