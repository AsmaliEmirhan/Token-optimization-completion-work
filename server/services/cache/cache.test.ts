import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryExactCache } from './exactCache.js';
import { baseRequest, scopeA, scopeB, result, createHarness, deferred, mockEntry } from './cacheTestUtils.js';
import { createExactCacheKey, stableSerialize } from './cacheKey.js';
import { validateChatRequest } from '../chat/requestValidation.js';
import { privateScopeFor } from './cachePolicy.js';
import type { ChatApiRequest, LLMResponse } from '../../types/api.js';

const fixtureVariants: Partial<ChatApiRequest>[] = [
  {}, { message: 'soru-1' }, { message: 'soru-2' }, { message: 'soru-3' },
  { message: 'İkili aramayı açıkla.' },
  { systemInstructions: 'Kısa yanıt ver.' },
  { conversation: [{ role: 'user', content: 'Önceki soru' }] },
  { generationParameters: { temperature: 0.2 } },
  { generationParameters: { topP: 0.5 } },
  { generationParameters: { maxOutputTokens: 100 } },
  { generationParameters: { seed: 7 } },
  { generationParameters: { stopSequences: ['END'] } },
];
test('ilk istek miss, sonraki tamamlanmış hit: tek provider çağrısı ve ayrı kimlikler', async () => {
  const h = createHarness();
  const first = await h.execute();
  const hit = await h.execute();
  assert.equal(first.telemetry.cacheStatus, 'miss');
  assert.equal(hit.telemetry.cacheStatus, 'hit');
  assert.equal(hit.telemetry.responseSource, 'shared_l1_cache');
  assert.equal(h.calls(), 1);
  assert.notEqual(first.telemetry.requestId, hit.telemetry.requestId);
  assert.equal(hit.telemetry.sourceRequestId, first.telemetry.requestId);
  assert.deepEqual([hit.telemetry.inputTokens, hit.telemetry.outputTokens, hit.telemetry.thinkingTokens,
    hit.telemetry.totalTokens, hit.telemetry.totalCost], [0, 0, 0, 0, 0]);
  assert.equal(hit.telemetry.avoidedEstimatedTokens, 30);
  assert.equal(hit.telemetry.sourceTotalTokens, 30);
  assert.equal(hit.telemetry.avoidedEstimatedApiCost, first.telemetry.totalCost);
  assert.equal(hit.telemetry.cacheInfrastructureCost, null);
});

test('farklı sağlayıcı veya tam model kimliği hit üretmez', async () => {
  const h = createHarness();
  await h.execute();
  for (const variant of [{ provider: 'gemini' }, { provider: 'groq' }, { model: 'gpt-4-turbo' }, { model: 'gpt-4o-2024-08-06' }]) {
    assert.equal((await h.execute(variant)).telemetry.cacheStatus, 'miss');
  }
  assert.equal(h.calls(), 5);
});

test('onaylı farklı mesaj/sistem/geçmiş/parametreler bağımsız miss üretir', async () => {
  const h = createHarness({ maxEntries: 30 });
  for (const variant of fixtureVariants) {
    assert.equal((await h.execute(variant)).telemetry.cacheStatus, 'miss');
    assert.equal((await h.execute(variant)).telemetry.cacheStatus, 'hit');
  }
  assert.equal(h.calls(), fixtureVariants.length);
});

test('sunucuda doğrulanan farklı oturum ve credential revizyonları ayrıdır', async () => {
  const h = createHarness();
  await h.execute({ message: 'Benim favori rengim ne?' });
  assert.equal((await h.execute({ message: 'Benim favori rengim ne?' }, scopeB)).telemetry.cacheStatus, 'miss');
  assert.equal((await h.execute({ message: 'Benim favori rengim ne?' }, { ...scopeA, credentialRevision: 2 })).telemetry.cacheStatus, 'miss');
  assert.equal(h.calls(), 3);
});

test('eski istemci securityScope iddiası yok sayılır, doğrulanmış oturum yerine geçemez', async () => {
  const forged = { ...baseRequest, securityScope: { sessionId: 'server-partition-a', userId: 'admin', tenantId: 'x' } };
  const h = createHarness();
  await h.execute();
  const response = await h.service.execute(forged, { apiKey: 'fake' });
  assert.equal(response.telemetry.cacheStatus, 'bypass');
  assert.equal(response.telemetry.cacheBypassReason, 'missing_verified_session');
  assert.equal(Object.hasOwn(validateChatRequest(forged), 'securityScope'), false);
});

test('güncel metin bypass, kişisel ve belirsiz metin özel kapsamda kalır', async () => {
  const h = createHarness();
  const dynamic = await h.execute({ message: 'Bugün hava nasıl?' });
  assert.equal(dynamic.telemetry.cacheStatus, 'bypass');
  assert.equal(dynamic.telemetry.cacheBypassReason, 'dynamic_information');
  for (const message of ['Benim hesabımdaki tutar?', 'Bu cümlede dinamik anahtar kelime yok.']) {
    const response = await h.execute({ message });
    assert.equal(response.telemetry.cacheScope, 'session_private');
  }
  assert.throws(() => validateChatRequest({ ...baseRequest, cacheSafe: true }));
  assert.equal(h.calls(), 3);
});

test('TTL sınırında miss ve LRU erişim sırası doğru', async () => {
  const h = createHarness({ ttlMs: 100, maxEntries: 2 });
  await h.execute({ message: 'soru-1' });
  await h.execute({ message: 'soru-2' });
  await h.execute({ message: 'soru-1' });
  await h.execute({ message: 'soru-3' });
  assert.equal((await h.execute({ message: 'soru-2' })).telemetry.cacheStatus, 'miss');
  h.advance(100);
  assert.equal(h.cache.size, 0);
  assert.equal((await h.execute({ message: 'soru-2' })).telemetry.cacheStatus, 'miss');
});

test('boyut sınırını aşan yanıt saklanmaz, normal yanıt olarak döner', async () => {
  const h = createHarness({ maxEntryBytes: 600 });
  h.behavior(async () => ({ ...result(), content: 'ş'.repeat(2000) }));
  const response = await h.execute();
  assert.equal(response.telemetry.cacheStatus, 'miss');
  assert.equal(response.telemetry.cacheWriteReason, 'entry_not_stored');
  assert.equal(h.cache.size, 0);
  await h.execute();
  assert.equal(h.calls(), 2);
});

test('başarısız veya tamamlanmamış yanıt saklanmaz; miss/bypass karışmaz', async () => {
  const h = createHarness();
  h.behavior(async () => { throw new Error('mock failure'); });
  await assert.rejects(h.execute(), /mock failure/);
  assert.equal(h.cache.size, 0);
  h.behavior(async () => ({ ...result(), cacheable: false }));
  const incomplete = await h.execute();
  assert.equal(incomplete.telemetry.cacheStatus, 'miss');
  assert.equal(incomplete.telemetry.cacheBypassReason, null);
  assert.equal(incomplete.telemetry.cacheWriteReason, 'incomplete_provider_response');
  assert.equal(h.cache.size, 0);
});

test('eşzamanlı birebir istekler tek üretim paylaşır: hit değil, maliyet yalnız ilk istekte', async () => {
  const h = createHarness();
  const gate = deferred<LLMResponse>();
  h.behavior(() => gate.promise);
  const a = h.execute();
  const b = h.execute();
  const c = h.execute();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls(), 1);
  assert.equal(h.service.inflightCount, 1);
  gate.resolve(result());
  const responses = await Promise.all([a, b, c]);
  assert.deepEqual(responses.map(r => r.telemetry.responseSource), ['provider', 'inflight_shared', 'inflight_shared']);
  assert.equal(new Set(responses.map(r => r.telemetry.requestId)).size, 3);
  assert.equal(new Set(responses.map(r => r.message.content)).size, 1);
  assert.equal(responses[1].telemetry.cacheHit, false);
  assert.equal(responses[1].telemetry.cacheType, null);
  assert.equal(responses[1].telemetry.sourceRequestId, responses[0].telemetry.requestId);
  assert.equal(responses.reduce((sum, r) => sum + r.telemetry.totalTokens!, 0), 30);
  assert.equal(responses.reduce((sum, r) => sum + r.telemetry.totalCost!, 0), responses[0].telemetry.totalCost);
  assert.equal(h.service.inflightCount, 0);
  assert.equal((await h.execute()).telemetry.responseSource, 'shared_l1_cache');
});

test('eşzamanlı farklı oturumlar iki provider çağrısı yapar', async () => {
  const h = createHarness();
  const [a, b] = await Promise.all([h.execute(), h.execute({}, scopeB)]);
  assert.equal(h.calls(), 2);
  assert.equal(a.telemetry.responseSource, 'provider');
  assert.equal(b.telemetry.responseSource, 'provider');
});

test('eşzamanlı credential revizyon değişimi eski üretime bağlanmaz', async () => {
  const h = createHarness();
  const gate = deferred<LLMResponse>();
  h.behavior(() => gate.promise);
  const oldRequest = h.execute();
  const newRequest = h.execute({}, { ...scopeA, credentialRevision: 2 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls(), 2);
  gate.resolve(result());
  assert.ok((await Promise.all([oldRequest, newRequest])).every(r => r.telemetry.responseSource === 'provider'));
});

test('eşzamanlı hata tüm bekleyenlere ulaşır, kayıt temizlenir ve yeniden denenebilir', async () => {
  const h = createHarness();
  h.behavior(async () => { throw new Error('mock failure'); });
  const results = await Promise.allSettled([h.execute(), h.execute()]);
  assert.ok(results.every(r => r.status === 'rejected'));
  assert.equal(h.calls(), 1);
  assert.equal(h.service.inflightCount, 0);
  assert.equal(h.cache.size, 0);
  h.behavior(async () => result());
  assert.equal((await h.execute()).telemetry.cacheStatus, 'miss');
});

test('zaman aşımı bekleyenleri temizler; geç yanıt cache yazamaz', async () => {
  const h = createHarness({ providerTimeoutMs: 20 });
  const gate = deferred<LLMResponse>();
  h.behavior(() => gate.promise);
  const responses = await Promise.allSettled([h.execute(), h.execute()]);
  assert.ok(responses.every(r => r.status === 'rejected' && /PROVIDER_TIMEOUT/.test(String(r.reason))));
  assert.equal(h.service.inflightCount, 0);
  gate.resolve(result());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.cache.size, 0);
  h.behavior(async () => result());
  assert.equal((await h.execute()).telemetry.cacheStatus, 'miss');
});

test('bekleyen ve üretim kapasitesi sınırlıdır', async () => {
  const h = createHarness({ maxWaitersPerKey: 1, maxConcurrentGenerations: 1 });
  const gate = deferred<LLMResponse>();
  h.behavior(() => gate.promise);
  const a = h.execute();
  const b = h.execute();
  await assert.rejects(h.execute(), /CAPACITY_EXCEEDED/);
  await assert.rejects(h.execute({}, scopeB), /CAPACITY_EXCEEDED/);
  gate.resolve(result());
  await Promise.all([a, b]);
});

test('bilinmeyen fiyat veya kullanım için önlenen maliyet null kalır', async () => {
  const h = createHarness();
  await h.execute({ model: 'unknown-model' });
  const unknown = await h.execute({ model: 'unknown-model' });
  assert.equal(unknown.telemetry.avoidedEstimatedApiCost, null);
  assert.equal(unknown.telemetry.totalCost, 0);
  h.behavior(async () => ({ ...result(), usage: { inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null } }));
  await h.execute();
  const hit = await h.execute();
  assert.equal(hit.telemetry.avoidedEstimatedTokens, null);
  assert.equal(hit.telemetry.avoidedEstimatedApiCost, null);
});

test('benzer sözcükler ve boşluk farkları semantik eşleşmez', async () => {
  const h = createHarness();
  await h.execute();
  assert.equal((await h.execute({ message: 'İkili aramayı açıkla.' })).telemetry.cacheStatus, 'miss');
  assert.equal((await h.execute({ message: baseRequest.message + ' ' })).telemetry.cacheStatus, 'miss');
});

test('cache kapalı veya açık bypass normal bağımsız provider çağrısı yapar', async () => {
  for (const enabled of [true, false]) {
    const h = createHarness({ cacheEnabled: enabled });
    const responses = await Promise.all([h.execute({ forceCacheBypass: true }), h.execute({ forceCacheBypass: true })]);
    assert.ok(responses.every(r => r.telemetry.cacheStatus === 'bypass'));
    assert.equal(h.calls(), 2);
    assert.equal(h.cache.size, 0);
  }
  assert.equal((await createHarness({ cacheEnabled: false }).execute()).telemetry.cacheStatus, 'bypass');
});

test('cache clear devam eden eski üretimin kaydı geri getirmesini engeller', async () => {
  const h = createHarness();
  const gate = deferred<LLMResponse>();
  h.behavior(() => gate.promise);
  const pending = h.execute();
  h.cache.clear();
  gate.resolve(result());
  assert.equal((await pending).telemetry.cacheWriteReason, 'cache_invalidated');
  assert.equal(h.cache.size, 0);
});

test('runtime şema bozuk/ek/uygulanmayan alanları ve prototip tuzaklarını reddeder', () => {
  const malformed: unknown[] = [
    null, [], { ...baseRequest, model: 1 }, { ...baseRequest, systemInstructions: {} },
    { ...baseRequest, generationParameters: [] }, { ...baseRequest, generationParameters: { temperature: NaN } },
    { ...baseRequest, generationParameters: { temperature: 3 } },
    { ...baseRequest, generationParameters: { maxOutputTokens: 1.5 } },
    { ...baseRequest, generationParameters: { stopSequences: [3] } },
    { ...baseRequest, generationParameters: { frequencyPenalty: 0.1 } },
    { ...baseRequest, provider: 'gemini', generationParameters: { seed: 1 } },
    { ...baseRequest, conversation: [{ role: 'system', content: 'x' }] },
    { ...baseRequest, conversation: [{ role: 'user', content: 'x', hidden: 'y' }] },
    { ...baseRequest, stream: 'false' }, { ...baseRequest, stream: true },
    { ...baseRequest, hasExternalSideEffects: true }, { ...baseRequest, response_format: {} },
    { ...baseRequest, toolContext: { cacheSafe: true, fingerprint: 'stable' } },
    { ...baseRequest, retrievalContext: { cacheSafe: false, fingerprint: 'unstable' } },
    { ...baseRequest, securityScope: [] },
    JSON.parse('{"provider":"openai","model":"gpt-4o","message":"x","__proto__":{"polluted":true}}'),
    Object.assign(Object.create({ polluted: true }), baseRequest),
  ];
  for (const value of malformed) assert.throws(() => validateChatRequest(value));
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('kanonik anahtar deterministik ve ham prompt/parametre/kapsam duyarlıdır', () => {
  const input = {
    ...baseRequest, systemInstructions: null, conversation: [],
    generationParameters: { temperature: 0.2, topP: 0.8 },
    ...privateScopeFor({ ...baseRequest, securityScope: scopeA }), policyVersion: 'test', toolContext: null, retrievalContext: null,
  };
  const key = createExactCacheKey(input);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, createExactCacheKey({ ...input, generationParameters: { topP: 0.8, temperature: 0.2 } }));
  assert.notEqual(key, createExactCacheKey({ ...input, message: input.message + ' ' }));
  assert.notEqual(key, createExactCacheKey({ ...input, ...privateScopeFor({ ...baseRequest, securityScope: scopeB }) }));
  assert.throws(() => stableSerialize({ value: Infinity }));
  assert.throws(() => stableSerialize(JSON.parse('{"__proto__":1}')));
});

test('kayıt kopyalama, toplam bayt sınırı, duplicate key, TTL ve invalidation korunur', () => {
  let now = 1000;
  const cache = new InMemoryExactCache({ ttlMs: 100, maxEntries: 20, maxEntryBytes: 2400, maxTotalBytes: 2500, now: () => now });
  const entry = (key: string) => mockEntry(key, now);
  const original = entry('a');
  assert.equal(cache.set(original), true);
  original.content = 'changed';
  assert.notEqual(cache.get('a')!.content, 'changed');
  const read = cache.get('a')!;
  read.content = 'changed-read';
  assert.notEqual(cache.get('a')!.content, 'changed-read');
  cache.set(entry('a'));
  assert.equal(cache.size, 1);
  cache.set(entry('b'));
  cache.set(entry('c'));
  assert.ok(cache.byteSize <= 2500);
  assert.equal(cache.get('a'), null);
  now += 100;
  assert.equal(cache.byteSize, 0);
  assert.equal(cache.size, 0);
  cache.set(entry('d'));
  assert.equal(cache.delete('d'), true);
  assert.equal(cache.byteSize, 0);
  assert.equal(cache.set({ ...entry('expired'), expiresAt: now }), false);
});
