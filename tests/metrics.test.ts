import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCacheAggregate, calculateCostAggregate, filterRecordsByTimeRange, getTimeRangeDurationMs, sumComplete } from '../src/utils/metrics';
import type { ExperimentRecord } from '../src/types/telemetry';
import { ChatService } from '../server/services/chat/chatService.js';
import { InMemoryExactCache } from '../server/services/cache/exactCache.js';
import { REVIEWED_STATIC_PROMPTS } from '../server/services/cache/cachePolicy.js';

async function records(): Promise<ExperimentRecord[]> {
  const service = new ChatService({ cache: new InMemoryExactCache({ ttlMs: 1000, maxEntries: 10 }), cacheTtlMs: 1000,
    providers: { openai: { async sendMessage() {
      return { content: 'answer', cacheable: true, latencyMs: 1,
        usage: { inputTokens: 10, outputTokens: 20, thinkingTokens: 0, totalTokens: 30 } };
    } } },
  });
  const input = { provider: 'openai', model: 'gpt-4o', message: REVIEWED_STATIC_PROMPTS[0] };
  const options = { apiKey: 'mock', securityScope: { partitionId: 'server', credentialRevision: 0 } };
  const responses = await Promise.all([service.execute(input, options), service.execute(input, options)]);
  responses.push(await service.execute(input, options));
  responses.push(await service.execute({ ...input, forceCacheBypass: true }, options));
  return responses.map(r => ({ id: r.telemetry.requestId, timestamp: r.telemetry.timestamp, mode: 'baseline',
    provider: r.provider, model: r.model, prompt: input.message, telemetry: r.telemetry,
    metrics: { ...r.metrics, totalCost: r.telemetry.totalCost } }));
}

test('gerçek backend telemetrisi frontend toplamında provider/shared/hit/bypass ayrımını korur', async () => {
  const data = await records();
  const cache = calculateCacheAggregate(data);
  assert.deepEqual([cache.hits, cache.misses, cache.inflightShared, cache.bypasses, cache.unknown], [1, 1, 1, 1, 0]);
  assert.equal(cache.hitRate, 50);
  assert.equal(cache.avoidedTokens, 60);
  assert.equal(sumComplete(data.map(r => r.metrics.totalTokens)), 60);
  assert.equal(calculateCostAggregate(data).totalKnownCost, Number((data[0].metrics.totalCost! * 2).toFixed(8)));
  assert.equal(cache.avoidedApiCost, data[0].metrics.totalCost! * 2);
});

test('bilinmeyen veya kısmi kullanım/fiyat sıfır uydurmaz', async () => {
  const data = await records();
  data[2].telemetry!.avoidedEstimatedTokens = null;
  data[2].telemetry!.avoidedEstimatedApiCost = null;
  assert.equal(calculateCacheAggregate(data).avoidedTokens, null);
  assert.equal(calculateCacheAggregate(data).avoidedApiCost, null);
  assert.equal(sumComplete([0, null]), null);
  assert.equal(sumComplete([0, 0]), 0);
  assert.equal(sumComplete([]), null);
  assert.equal(calculateCostAggregate([{ ...data[0], metrics: { ...data[0].metrics, totalCost: null } }]).totalKnownCost, null);
  const partial = calculateCostAggregate([data[0], { ...data[1], metrics: { ...data[1].metrics, totalCost: null } }]);
  assert.equal(partial.hasPartialCoverage, true);
});

test('saat/gün/hafta/ay aynı sınıfları toplar; sınır dışı ve gelecek kayıtları dışlar', async () => {
  const data = await records();
  const now = Date.now();
  for (const range of ['hour', 'day', 'week', 'month'] as const) {
    const duration = getTimeRangeDurationMs(range);
    const inputs = data.map(r => ({ ...r, timestamp: now - duration }));
    inputs.push({ ...data[0], timestamp: now - duration - 1 }, { ...data[0], timestamp: now + 1 });
    const filtered = filterRecordsByTimeRange(inputs, range, now);
    assert.equal(filtered.length, 4);
    assert.equal(calculateCacheAggregate(filtered).inflightShared, 1);
  }
});
