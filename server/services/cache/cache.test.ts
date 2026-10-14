import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryExactCache } from './exactCache.js';
import { ChatService } from '../chat/chatService.js';
import type { ChatApiRequest, LLMProvider } from '../../types/api.js';

function createHarness(options: { maxEntries?: number; ttlMs?: number; model?: string } = {}) {
  let now = 1_000;
  let calls = 0;
  let shouldFail = false;
  let cacheable = true;
  let id = 0;
  const provider: LLMProvider = {
    async sendMessage({ message }) {
      calls++;
      if (shouldFail) throw new Error('mock provider failure');
      return {
        content: `yanıt:${message}`,
        cacheable,
        usage: { inputTokens: 10, outputTokens: 20, thinkingTokens: 0, totalTokens: 30 },
        latencyMs: 5,
      };
    },
  };
  const cache = new InMemoryExactCache({
    maxEntries: options.maxEntries ?? 10,
    ttlMs: options.ttlMs ?? 1_000,
    now: () => now,
  });
  const service = new ChatService({
    providers: { openai: provider, gemini: provider },
    cache,
    cacheTtlMs: options.ttlMs ?? 1_000,
    now: () => now,
    createId: () => `id-${++id}`,
  });
  const request = (overrides: Partial<ChatApiRequest> = {}): ChatApiRequest => ({
    provider: 'openai',
    model: options.model ?? 'gpt-4o',
    message: 'Türkiye\'nin başkenti neresidir?',
    securityScope: { sessionId: 'session-a' },
    ...overrides,
  });
  return {
    cache,
    service,
    request,
    execute: (overrides: Partial<ChatApiRequest> = {}) => service.execute(request(overrides), { apiKey: 'test-key' }),
    calls: () => calls,
    advance: (ms: number) => { now += ms; },
    failProvider: (value: boolean) => { shouldFail = value; },
    setCacheable: (value: boolean) => { cacheable = value; },
  };
}

test('ilk birebir istek miss, ikinci istek hit olur ve provider tekrar çağrılmaz', async () => {
  const h = createHarness();
  const first = await h.execute();
  const second = await h.execute();
  assert.equal(first.telemetry.cacheHit, false);
  assert.equal(second.telemetry.cacheHit, true);
  assert.equal(second.telemetry.cacheType, 'exact');
  assert.equal(h.calls(), 1);
});

test('hit isteğinde yeni LLM tokenı ve gerçek API maliyeti sıfırdır', async () => {
  const h = createHarness();
  await h.execute();
  const hit = await h.execute();
  assert.deepEqual(
    [hit.telemetry.inputTokens, hit.telemetry.outputTokens, hit.telemetry.thinkingTokens, hit.telemetry.totalTokens],
    [0, 0, 0, 0],
  );
  assert.equal(hit.telemetry.totalCost, 0);
  assert.equal(hit.telemetry.avoidedEstimatedTokens, 30);
  assert.equal(typeof hit.telemetry.avoidedEstimatedApiCost, 'number');
});

test('farklı model ve sağlayıcı L1 hit oluşturmaz', async () => {
  const h = createHarness();
  await h.execute();
  assert.equal((await h.execute({ model: 'gpt-4-turbo' })).telemetry.cacheHit, false);
  assert.equal((await h.execute({ provider: 'gemini' })).telemetry.cacheHit, false);
});

test('sistem talimatı, konuşma bağlamı ve üretim parametreleri anahtarı değiştirir', async () => {
  const h = createHarness();
  await h.execute();
  assert.equal((await h.execute({ systemInstructions: 'Kısa yanıt ver.' })).telemetry.cacheHit, false);
  assert.equal((await h.execute({ conversation: [{ role: 'user', content: 'Önceki soru' }] })).telemetry.cacheHit, false);
  assert.equal((await h.execute({ generationParameters: { temperature: 0.2 } })).telemetry.cacheHit, false);
});

test('farklı kullanıcı/tenant kapsamları arasında paylaşım yapılmaz', async () => {
  const h = createHarness();
  await h.execute({ securityScope: { tenantId: 'tenant-a', userId: 'user-a' } });
  const other = await h.execute({ securityScope: { tenantId: 'tenant-a', userId: 'user-b' } });
  assert.equal(other.telemetry.cacheHit, false);
  assert.equal(h.calls(), 2);
});

test('süresi dolan kayıt miss olur', async () => {
  const h = createHarness({ ttlMs: 100 });
  await h.execute();
  h.advance(101);
  assert.equal((await h.execute()).telemetry.cacheHit, false);
  assert.equal(h.calls(), 2);
});

test('maksimum kapasitede en az kullanılan kayıt deterministik olarak atılır', async () => {
  const h = createHarness({ maxEntries: 2 });
  await h.execute({ message: 'soru-1' });
  await h.execute({ message: 'soru-2' });
  await h.execute({ message: 'soru-1' });
  await h.execute({ message: 'soru-3' });
  assert.equal((await h.execute({ message: 'soru-2' })).telemetry.cacheHit, false);
});

test('başarısız provider yanıtı cache kaydı oluşturmaz', async () => {
  const h = createHarness();
  h.failProvider(true);
  await assert.rejects(() => h.execute(), /mock provider failure/);
  assert.equal(h.cache.size, 0);
});

test('tamamlanmamış provider yanıtı cache kaydı oluşturmaz', async () => {
  const h = createHarness();
  h.setCacheable(false);
  const response = await h.execute();
  assert.equal(response.telemetry.cacheBypassReason, 'incomplete_provider_response');
  assert.equal(h.cache.size, 0);
});

test('fiyatı bilinmeyen modelde önlenen maliyet null kalır', async () => {
  const h = createHarness({ model: 'unknown-model' });
  await h.execute();
  const hit = await h.execute();
  assert.equal(hit.telemetry.cacheHit, true);
  assert.equal(hit.telemetry.avoidedEstimatedApiCost, null);
});

test('eşzamanlı farklı kapsamlı istekler güvensiz veri paylaşmaz', async () => {
  const h = createHarness();
  const [a, b] = await Promise.all([
    h.execute({ securityScope: { sessionId: 'a' } }),
    h.execute({ securityScope: { sessionId: 'b' } }),
  ]);
  assert.equal(a.telemetry.cacheHit, false);
  assert.equal(b.telemetry.cacheHit, false);
  assert.equal(h.calls(), 2);
});

test('benzer anlamlı fakat farklı yazılmış soru L1 semantik hit oluşturmaz', async () => {
  const h = createHarness();
  await h.execute({ message: 'Türkiye\'nin başkenti neresidir?' });
  const variant = await h.execute({ message: 'Türkiye başkent ne?' });
  assert.equal(variant.telemetry.cacheHit, false);
});

test('kapsamsız ve güncel istekler güvenli biçimde cache bypass eder', async () => {
  const h = createHarness();
  const noScope = await h.execute({ securityScope: undefined });
  const dynamic = await h.execute({ message: 'Bugün hava durumu nasıl?' });
  assert.equal(noScope.telemetry.cacheEligible, false);
  assert.equal(noScope.telemetry.cacheBypassReason, 'missing_security_scope');
  assert.equal(dynamic.telemetry.cacheEligible, false);
  assert.equal(dynamic.telemetry.cacheBypassReason, 'potentially_dynamic_content');
  assert.equal(h.cache.size, 0);
});
