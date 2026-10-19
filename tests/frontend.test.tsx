import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownRenderer } from '../src/components/MarkdownRenderer';
import { RequestAnalysis } from '../src/components/RequestAnalysis';
import { MetricsPopover } from '../src/components/MetricsPopover';
import { ThemeProvider } from '../src/context/ThemeContext';
import { SettingsModal } from '../src/components/SettingsModal';
import { apiFetch } from '../src/utils/api';
import type { RequestAnalysisData } from '../src/types/telemetry';

test('Markdown: başlık/liste/kod/tablo ve güvenli bağlantı render sözleşmesi korunur', () => {
  const markup = renderToStaticMarkup(<MarkdownRenderer content={'# Başlık\n\n**kalın**\n\n- madde\n\n```ts\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[link](https://example.com)'} />);
  for (const fragment of ['Başlık', '<strong', '<ul', '<code', '<table', 'noopener noreferrer', 'dark:']) assert.ok(markup.includes(fragment));
});

test('İstek Analizi üç yanıt kaynağıyla render edilir; aç/kapa erişilebilirliği korunur', () => {
  for (const responseSource of ['provider', 'l1_exact_cache', 'inflight_shared'] as const) {
    const markup = renderToStaticMarkup(<RequestAnalysis provider="openai" model="gpt-4o"
      inputTokens={0} outputTokens={0} thinkingTokens={0} totalTokens={0} latencyMs={1} totalCost={0}
      cacheHit={responseSource === 'l1_exact_cache'} cacheEligible={true}
      cacheStatus={responseSource === 'provider' ? 'miss' : responseSource === 'l1_exact_cache' ? 'hit' : 'inflight_shared'}
      cacheBypassReason={null} responseSource={responseSource} sourceProvider="openai" sourceModel="gpt-4o"
      sourceTotalTokens={30} sourceRequestId="source" avoidedEstimatedTokens={30} avoidedEstimatedApiCost={0.001} />);
    assert.ok(markup.includes('İstek Analizi'));
    assert.ok(markup.includes('aria-expanded="false"'));
  }
});

test('Metrikler ve sağlayıcı ayarları mevcut tema sağlayıcısıyla render edilir', () => {
  const markup = renderToStaticMarkup(<ThemeProvider>
    <MetricsPopover experimentRecords={[]} onClose={() => {}} triggerRef={{ current: null }} />
    <SettingsModal isOpen={true} onClose={() => {}} />
  </ThemeProvider>);
  for (const text of ['Kullanım Analizi', 'Saatlik', 'Günlük', 'Haftalık', 'Aylık', 'dark:']) assert.ok(markup.includes(text));
});

test('frontend açılışı tek oturum kurar, POST koruma başlığı ve aynı-origin çerezleri taşınır', async t => {
  const requests: { path: string; init?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    requests.push({ path, init });
    return new Response('{}', { status: 200 });
  });
  await Promise.all([
    apiFetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    apiFetch('/api/providers/openai/configure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"apiKey":"mock"}' }),
  ]);
  assert.equal(requests.filter(r => r.path === '/api/providers').length, 1);
  for (const request of requests) {
    assert.equal(request.init?.credentials, 'same-origin');
    if (request.init?.method === 'POST') assert.equal(new Headers(request.init.headers).get('X-TokenAI-Request'), '1');
  }
});

test('açık İstek Analizi kapsam, beş durum, karar, kaynak ve maliyeti iki tema sınıfıyla gösterir', () => {
  const base: RequestAnalysisData = { provider: 'openai', model: 'gpt-4o', inputTokens: 0, outputTokens: 0,
    thinkingTokens: 0, totalTokens: 0, latencyMs: 1, totalCost: 0, cacheHit: true, cacheEligible: true,
    cacheStatus: 'hit', cacheScope: 'shared', cacheDecisionReason: 'static_geography', cacheBypassReason: null,
    cacheLookupLatencyMs: 0.4, responseSource: 'shared_l1_cache', sourceProvider: 'openai', sourceModel: 'gpt-4o',
    sourceRequestId: 'source', sourceTotalTokens: 30, avoidedEstimatedTokens: 30, avoidedEstimatedApiCost: null };
  const variants: [Partial<RequestAnalysisData>, string][] = [
    [{}, 'Shared Hit'],
    [{ cacheScope: 'session_private', responseSource: 'private_l1_cache' }, 'Private Hit'],
    [{ cacheStatus: 'miss', cacheHit: false, responseSource: 'provider' }, 'Miss'],
    [{ cacheStatus: 'bypass', cacheScope: null, cacheDecisionReason: 'dynamic_information', responseSource: 'provider' }, 'Bypass'],
    [{ cacheStatus: 'inflight_shared', cacheScope: 'session_private', responseSource: 'inflight_shared' }, 'In-flight Shared'],
  ];
  for (const [change, status] of variants) {
    const markup = renderToStaticMarkup(<RequestAnalysis {...base} {...change} defaultExpanded />);
    for (const text of [status, 'Cache Kapsamı', 'Cache Karar Nedeni', 'Yanıt Kaynağı', 'dark:', 'aria-expanded="true"']) {
      assert.ok(markup.includes(text), text);
    }
    if (change.responseSource !== 'provider') {
      assert.ok(markup.includes('Önlenen Tahmini API Maliyeti'));
      assert.ok(markup.includes('garantili fatura tasarrufu değildir'));
      assert.ok(markup.includes('$0.00'));
    }
  }
});
