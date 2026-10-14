import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, type AppOptions } from './app.js';
import { REVIEWED_STATIC_PROMPTS } from './services/cache/cachePolicy.js';
import type { LLMProvider, LLMResponse, ChatApiResponse } from './types/api.js';

const request = { provider: 'openai', model: 'gpt-4o', message: REVIEWED_STATIC_PROMPTS[0] };
const response = (): LLMResponse => ({ content: '**Yanıt**', cacheable: true, latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, thinkingTokens: 0, totalTokens: 30 } });

async function fixture(t: TestContext, options: AppOptions = {}) {
  let calls = 0;
  let respond = async (): Promise<LLMResponse> => response();
  const keys: string[] = [];
  const provider: LLMProvider = { async sendMessage(params) {
    calls++; keys.push(params.apiKey); return respond();
  } };
  const runtime = createApp({ providers: { openai: provider, gemini: provider, groq: provider }, ...options });
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('NO_PORT');
  const url = 'http://127.0.0.1:' + address.port;
  t.after(async () => {
    runtime.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  });
  function client(origin = 'http://localhost:5173') {
    let cookie = '';
    return {
      get cookie() { return cookie; },
      async send(path: string, body?: unknown, extra: Record<string, string> = {}) {
        const res = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
          headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-TokenAI-Request': '1' }), ...extra },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return res;
      },
    };
  }
  async function configured(key = 'test-secret') {
    const c = client();
    assert.equal((await c.send('/api/providers')).status, 200);
    assert.equal((await c.send('/api/providers/openai/configure', { apiKey: key })).status, 200);
    return c;
  }
  return { ...runtime, url, client, configured, keys, calls: () => calls,
    behavior: (fn: typeof respond) => { respond = fn; } };
}

test('HTTP oturum çerezi HttpOnly/SameSite; sözleşme miss/hit, ayrı requestId ve gizli veri sızıntısı yok', async t => {
  const f = await fixture(t);
  const c = f.client();
  const bootstrap = await c.send('/api/providers');
  const setCookie = bootstrap.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /tokenai-session=[a-f0-9]{64}/);
  assert.doesNotMatch(setCookie, /Expires|Max-Age/);
  assert.equal(bootstrap.headers.get('cache-control'), 'no-store');
  await c.send('/api/providers/openai/configure', { apiKey: 'secret-not-in-response' });
  const firstResponse = await c.send('/api/chat', request);
  const first = await firstResponse.json() as ChatApiResponse;
  const second = await (await c.send('/api/chat', request)).json() as ChatApiResponse;
  assert.equal(firstResponse.headers.get('x-request-id'), first.telemetry.requestId);
  assert.equal(first.telemetry.cacheStatus, 'miss');
  assert.equal(second.telemetry.cacheStatus, 'hit');
  assert.notEqual(first.telemetry.requestId, second.telemetry.requestId);
  assert.equal(f.calls(), 1);
  const body = JSON.stringify([first, second]);
  assert.ok(!body.includes('secret-not-in-response'));
  assert.ok(!body.includes(c.cookie.split('=')[1]));
  assert.equal(second.metrics?.totalTokens, 0);
});

test('HTTP sahte kullanıcı/tenant/session kapsamı başka oturuma ve API anahtarına erişemez', async t => {
  const f = await fixture(t);
  const a = await f.configured('key-a');
  const b = f.client();
  const providers = await (await b.send('/api/providers')).json() as { providers: { configured: boolean }[] };
  assert.ok(providers.providers.every(p => !p.configured));
  const forged = { ...request, securityScope: { sessionId: a.cookie.split('=')[1], userId: 'admin', tenantId: 'root' } };
  assert.equal((await b.send('/api/chat', forged)).status, 400);
  await b.send('/api/providers/openai/configure', { apiKey: 'key-b' });
  const first = await (await a.send('/api/chat', request)).json() as ChatApiResponse;
  const other = await (await b.send('/api/chat', forged)).json() as ChatApiResponse;
  assert.equal(first.telemetry.cacheStatus, 'miss');
  assert.equal(other.telemetry.cacheStatus, 'miss');
  assert.deepEqual(f.keys, ['key-a', 'key-b']);
});

test('API anahtarı yenilenince eski cache paylaşılmaz', async t => {
  const f = await fixture(t);
  const c = await f.configured('old');
  await c.send('/api/chat', request);
  await c.send('/api/providers/openai/configure', { apiKey: 'new' });
  const second = await (await c.send('/api/chat', request)).json() as ChatApiResponse;
  assert.equal(second.telemetry.cacheStatus, 'miss');
  assert.deepEqual(f.keys, ['old', 'new']);
});

test('Origin/Fetch-Metadata/özel başlık CSRF koruması ve hatalı JSON', async t => {
  const f = await fixture(t);
  const c = await f.configured();
  assert.equal((await c.send('/api/chat', request, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.send('/api/chat', request, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await c.send('/api/chat', request, { 'X-TokenAI-Request': '' })).status, 403);
  assert.equal((await c.send('/api/chat', request, { 'Content-Type': 'text/plain' })).status, 403);
  const invalid = await fetch(f.url + '/api/chat', { method: 'POST',
    headers: { Cookie: c.cookie, Origin: 'http://localhost:5173', 'Content-Type': 'application/json', 'X-TokenAI-Request': '1' }, body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal(f.calls(), 0);
});

test('HTTP bozuk/uygulanmayan alanlar reddedilir; onaysız serbest sohbet normal çalışır', async t => {
  const f = await fixture(t);
  const c = await f.configured();
  for (const extra of [{ generationParameters: { temperature: 9 } }, { cacheSafe: true },
    { toolContext: { cacheSafe: true, fingerprint: 'x' } }, { provider: '__proto__' }]) {
    const res = await c.send('/api/chat', { ...request, ...extra });
    assert.equal(res.status, 400);
    assert.ok((await res.json() as { requestId: string }).requestId);
  }
  const bypass = await (await c.send('/api/chat', { ...request, message: 'Ne haber?' })).json() as ChatApiResponse;
  assert.equal(bypass.telemetry.cacheStatus, 'bypass');
  assert.equal(bypass.telemetry.responseSource, 'provider');
  assert.equal(f.calls(), 1);
});

test('HTTPS ortamında __Host- ve Secure; sahte forwarded başlığına güvenilmez', async t => {
  const f = await fixture(t, { allowedOrigins: ['https://tokenai.example'] });
  const secure = await f.client('https://tokenai.example').send('/api/providers');
  assert.match(secure.headers.get('set-cookie')!, /__Host-tokenai-session=/);
  assert.match(secure.headers.get('set-cookie')!, /Secure/);
  const local = await fixture(t);
  const plain = await local.client().send('/api/providers', undefined, { 'X-Forwarded-Proto': 'https' });
  assert.doesNotMatch(plain.headers.get('set-cookie')!, /Secure/);
});

test('oturum süresi dolunca, cookie kaybolunca ve sunucu yeniden başlayınca eski erişim yok', async t => {
  let now = 1000;
  const f = await fixture(t, { sessions: { now: () => now, ttlMs: 100 } });
  const c = await f.configured();
  const original = c.cookie;
  now += 100;
  assert.equal((await c.send('/api/chat', request)).status, 400);
  assert.notEqual(c.cookie, original);
  const freshBrowser = f.client();
  assert.equal((await freshBrowser.send('/api/chat', request)).status, 400);
  const restarted = await fixture(t);
  const res = await restarted.client().send('/api/chat', request, { Cookie: original });
  assert.equal(res.status, 400);
  assert.notEqual(res.headers.get('set-cookie')?.split(';')[0], original);
});

test('oturum sabitleme/çerez çoğaltma kabul edilmez; kapasite sınırlıdır', async t => {
  const f = await fixture(t, { sessions: { maxSessions: 2 } });
  const attackerCookie = 'tokenai-session=' + 'a'.repeat(64);
  const a = await f.client().send('/api/providers', undefined, { Cookie: attackerCookie });
  assert.notEqual(a.headers.get('set-cookie')?.split(';')[0], attackerCookie);
  const first = a.headers.get('set-cookie')!.split(';')[0];
  const duplicate = await f.client().send('/api/providers', undefined, { Cookie: first + '; ' + first });
  assert.notEqual(duplicate.headers.get('set-cookie')?.split(';')[0], first);
  assert.equal((await f.client().send('/api/providers')).status, 503);
});

test('HTTP eşzamanlı paylaşım/hata/timeout kontrollüdür ve in-flight temizlenir', async t => {
  const f = await fixture(t, { providerTimeoutMs: 100 });
  const c = await f.configured();
  // Zamanlayıcı sadece mocked provider içindir; ücretli API veya dış ağ kullanılmaz.
  f.behavior(async () => { await new Promise(resolve => setTimeout(resolve, 30)); return response(); });
  const responses = await Promise.all([c.send('/api/chat', request), c.send('/api/chat', request)]);
  const bodies = await Promise.all(responses.map(r => r.json())) as ChatApiResponse[];
  assert.equal(f.calls(), 1);
  assert.deepEqual(bodies.map(b => b.telemetry.responseSource).sort(), ['inflight_shared', 'provider']);
  assert.equal(new Set(bodies.map(b => b.telemetry.requestId)).size, 2);
  f.cache.clear();
  f.behavior(async () => { await new Promise(resolve => setTimeout(resolve, 30)); throw new Error('private-api-key'); });
  const failed = await Promise.all([c.send('/api/chat', request), c.send('/api/chat', request)]);
  assert.ok(failed.every(r => r.status === 502));
  assert.ok(!(await failed[0].text()).includes('private-api-key'));
  assert.equal(f.chatService.inflightCount, 0);
  assert.equal(f.cache.size, 0);
  f.behavior(() => new Promise<LLMResponse>(() => {}));
  assert.equal((await c.send('/api/chat', request)).status, 504);
  assert.equal(f.chatService.inflightCount, 0);
});

test('Gemini model keşfi ve Groq yapılandırması oturuma özeldir', async t => {
  const f = await fixture(t, { discoverGeminiModels: async () => [{ id: 'mock-gemini', name: 'Mock Gemini' }] });
  const a = f.client();
  await a.send('/api/providers');
  for (const provider of ['gemini', 'groq']) {
    assert.equal((await a.send('/api/providers/' + provider + '/configure', { apiKey: 'fake' })).status, 200);
    assert.equal((await a.send('/api/chat', { ...request, provider, model: 'mock-' + provider })).status, 200);
  }
  const b = await (await f.client().send('/api/providers')).json() as { providers: { id: string; configured: boolean; models: unknown[] }[] };
  assert.ok(b.providers.every(p => !p.configured));
  assert.equal(b.providers.find(p => p.id === 'gemini')?.models.length, 0);
});

test('gerçek Vite proxy Set-Cookie ve Cookie başlıklarını uçtan uca taşır', async t => {
  const f = await fixture(t);
  const { createServer } = await import('vite');
  const proxy = await createServer({ configFile: false, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: f.url, changeOrigin: true } } },
  });
  await proxy.listen();
  t.after(() => proxy.close());
  const address = proxy.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('NO_PROXY_PORT');
  const url = 'http://127.0.0.1:' + address.port;
  const bootstrap = await fetch(url + '/api/providers', { headers: { Origin: 'http://localhost:5173' } });
  const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0];
  assert.ok(cookie.startsWith('tokenai-session='));
  const headers = { Origin: 'http://localhost:5173', Cookie: cookie, 'Content-Type': 'application/json', 'X-TokenAI-Request': '1' };
  assert.equal((await fetch(url + '/api/providers/openai/configure', { method: 'POST', headers,
    body: JSON.stringify({ apiKey: 'proxy-test' }) })).status, 200);
  const chat = await fetch(url + '/api/chat', { method: 'POST', headers, body: JSON.stringify(request) });
  assert.equal(chat.status, 200);
  assert.equal((await chat.json() as ChatApiResponse).telemetry.cacheStatus, 'miss');
  assert.deepEqual(f.keys, ['proxy-test']);
});
