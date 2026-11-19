/**
 * /api/chat L1 akışının uçtan uca testi.
 * Gerçek sağlayıcı, gerçek MySQL ve gerçek model kullanılmaz:
 *  - sohbet sağlayıcısı sahte (çağrı sayısı sayılır)
 *  - depolama bellek içi (InMemoryStorageMock)
 *  - sınıflandırıcı servisi sahte fetch ile taklit edilir
 */
import type { AddressInfo } from 'node:net';
import { exactCacheService } from '../server/services/cache/exactCache.js';
import { InMemoryStorageMock } from '../server/services/cache/mysqlClient.js';
import { berturkClassifier } from '../server/services/classifier/berturkClassifier.js';
import { sessionManager } from '../server/services/chat/sessionManager.js';
import type { LLMProvider } from '../server/types/api.js';

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

type Probs = { genel: number; kisisel: number; degisken: number; sanatsal: number };
// Test için soru → sınıflandırıcı çıktısı tablosu (yalnızca sahte servis; uygulamada böyle bir tablo yoktur)
const FAKE_MODEL: Record<string, Probs> = {
  "Türkiye'nin başkenti neresidir?": { genel: 0.98, kisisel: 0.01, degisken: 0.005, sanatsal: 0.005 },
  'Fotosentez nasıl gerçekleşir?': { genel: 0.97, kisisel: 0.01, degisken: 0.01, sanatsal: 0.01 },
  'Benim adım ne?': { genel: 0.01, kisisel: 0.97, degisken: 0.01, sanatsal: 0.01 },
  'Güncel altın fiyatı nedir?': { genel: 0.02, kisisel: 0.01, degisken: 0.96, sanatsal: 0.01 },
  'Bana dört kıtalık şiir yaz.': { genel: 0.03, kisisel: 0.01, degisken: 0.01, sanatsal: 0.95 },
  'Müzik bir sanat mıdır?': { genel: 0.7, kisisel: 0.05, degisken: 0.2, sanatsal: 0.05 },
};

let classifierMode: 'ok' | 'down' = 'ok';
let classifierCalls = 0;
const fakeClassifierFetch = (async (_url: string, init?: RequestInit) => {
  classifierCalls++;
  if (classifierMode === 'down') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const { text } = JSON.parse(String(init?.body));
  const probs = FAKE_MODEL[text] ?? { genel: 0.25, kisisel: 0.25, degisken: 0.25, sanatsal: 0.25 };
  const label = (Object.keys(probs) as (keyof Probs)[]).reduce((a, b) => (probs[b] > probs[a] ? b : a));
  return new Response(JSON.stringify({ label, probs, p_genel: probs.genel, model_version: 'berturk-test', tau: 0.5, latency_ms: 5 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as unknown as typeof fetch;

const chatCalls: Record<string, number> = { openai: 0, gemini: 0, groq: 0 };
function fakeProvider(name: string): LLMProvider {
  return {
    async sendMessage({ message }) {
      chatCalls[name]++;
      return {
        content: `[${name}] Yanıt: ${message} — bu, testte üretilmiş yeterince uzun bir yanıttır.`,
        usage: { inputTokens: 20, outputTokens: 40, thinkingTokens: 0, totalTokens: 60 },
        latencyMs: 5,
      };
    },
  };
}

export async function runL1FlowTests() {
  console.log('\n--- 4. /api/chat L1 UÇTAN UCA AKIŞ TESTLERİ ---');
  // server/index.ts, NODE_ENV=test değilse 3001 portunu dinler; bu yüzden ortam ayarlandıktan sonra dinamik içe aktarılır
  process.env.NODE_ENV = 'test';
  const { app, providers } = await import('../server/index.js');

  const storage = new InMemoryStorageMock();
  (exactCacheService as any).storage = storage;
  (berturkClassifier as any).fetchImpl = fakeClassifierFetch;
  for (const p of ['openai', 'gemini', 'groq']) providers[p] = fakeProvider(p);
  const SESSION_A = 'session_user_a_123';
  const SESSION_B = 'session_user_b_456';
  for (const p of ['openai', 'gemini', 'groq']) sessionManager.setApiKey(SESSION_A, p, `key-a-${p}`);
  sessionManager.setApiKey(SESSION_B, 'gemini', 'key-b-gemini');

  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const chat = async (session: string, body: Record<string, unknown>) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': session },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json()) as any };
  };

  try {
    // 1. İlk genel istek → MISS ve kaydedilir
    {
      const r = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: "Türkiye'nin başkenti neresidir?", mode: 'optimized' });
      const t = r.data.telemetry;
      assert(r.status === 200 && t.cacheStatus === 'MISS' && t.bypassReason === null, 'İlk genel istek MISS olmalıdır');
      assert(t.questionCategory === 'genel' && t.cachedSaved === true, 'Genel soru kategoriyle birlikte kaydedilmelidir');
      assert(t.totalTokens === 60, 'MISS durumunda sohbet tokenları raporlanmalıdır');
    }

    // 2. Aynı soru başka sağlayıcıdan (Gemini, başka kullanıcı) → HIT, sohbet API'si ve sınıflandırıcı çağrılmaz
    {
      const before = { chat: chatCalls.gemini, clf: classifierCalls };
      const r = await chat(SESSION_B, { provider: 'gemini', model: 'gemini-x', message: "  türkiye'nin   başkenti neresidir?", mode: 'optimized' });
      const t = r.data.telemetry;
      assert(t.cacheStatus === 'HIT' && t.cacheHit === true, 'Başka sağlayıcıdan aynı soru HIT olmalıdır');
      assert(chatCalls.gemini === before.chat && classifierCalls === before.clf, 'HIT durumunda sohbet API ve sınıflandırıcı çağrılmamalıdır');
      assert(t.inputTokens === 0 && t.outputTokens === 0 && t.thinkingTokens === 0 && t.totalTokens === 0 && t.totalCost === 0, 'HIT durumunda tüm sohbet token ve maliyetleri 0 olmalıdır');
      assert(t.sourceProvider === 'openai' && t.sourceModel === 'gpt-4o', 'HIT yanıtının kaynak modeli raporlanmalıdır');
      assert(r.data.message.content.startsWith('[openai]'), 'HIT yanıtı OpenAI tarafından üretilmiş içerik olmalıdır');
    }

    // 3. Kişisel / değişken / sanatsal → BYPASS (gerçek nedeniyle) ve kaydedilmez
    for (const [q, cat, reason] of [
      ['Benim adım ne?', 'kisisel', 'CATEGORY_KISISEL'],
      ['Güncel altın fiyatı nedir?', 'degisken', 'CATEGORY_DEGISKEN'],
      ['Bana dört kıtalık şiir yaz.', 'sanatsal', 'CATEGORY_SANATSAL'],
    ] as const) {
      const r1 = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: q, mode: 'optimized' });
      const r2 = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: q, mode: 'optimized' });
      assert(r1.data.telemetry.cacheStatus === 'BYPASS' && r1.data.telemetry.bypassReason === reason && r1.data.telemetry.questionCategory === cat,
        `${cat} soru ${reason} nedeniyle BYPASS olmalıdır`);
      assert(r2.data.telemetry.cacheStatus === 'BYPASS', `${cat} soru tekrarında da HIT olmamalıdır (kaydedilmemiş olmalı)`);
    }

    // 4. Genel ama düşük güven → LOW_CONFIDENCE, kaydedilmez
    {
      const r = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: 'Müzik bir sanat mıdır?', mode: 'optimized' });
      assert(r.data.telemetry.bypassReason === 'LOW_CONFIDENCE' && r.data.telemetry.cachedSaved === false, 'Eşiğin altındaki genel soru kaydedilmemelidir');
    }

    // 5. Farklı soru → yanlış HIT olmamalı
    {
      const r = await chat(SESSION_A, { provider: 'groq', model: 'llama', message: 'Fotosentez nasıl gerçekleşir?', mode: 'optimized' });
      assert(r.data.telemetry.cacheStatus === 'MISS', 'Farklı genel soru MISS olmalı, önceki kayıttan yanlış HIT almamalıdır');
    }

    // 6. Sınıflandırıcı servisi kapalı → sohbet devam eder, neden CLASSIFIER_UNAVAILABLE
    {
      classifierMode = 'down';
      const r = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: 'Işık hızı kaçtır?', mode: 'optimized' });
      classifierMode = 'ok';
      assert(r.status === 200 && r.data.message.content.length > 0, 'Sınıflandırıcı kapalıyken sohbet yanıtı dönmelidir');
      assert(r.data.telemetry.cacheStatus === 'BYPASS' && r.data.telemetry.bypassReason === 'CLASSIFIER_UNAVAILABLE', 'Neden CLASSIFIER_UNAVAILABLE olarak raporlanmalıdır');
    }

    // 7. Veritabanı erişilemez → sohbet devam eder, genel soru için neden DB_UNAVAILABLE
    {
      (exactCacheService as any).storage = { isAvailable: () => false, get: async () => null, set: async () => false, del: async () => false, quit: async () => {} };
      const r = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: 'Fotosentez nasıl gerçekleşir?', mode: 'optimized' });
      (exactCacheService as any).storage = storage;
      assert(r.status === 200 && r.data.telemetry.bypassReason === 'DB_UNAVAILABLE', 'DB kapalıyken neden DB_UNAVAILABLE olmalı ve sohbet devam etmelidir');
    }

    // 8. İzin kapalı → sınıflandırıcı çağrılmaz
    {
      const before = classifierCalls;
      const r = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: 'Fotosentez nasıl gerçekleşir? (izinsiz)', mode: 'optimized', userConsent: false });
      assert(classifierCalls === before && r.data.telemetry.bypassReason === 'CONSENT_DENIED', 'İzin yokken sınıflandırıcı çağrılmamalıdır');
    }

    // 9. Baseline → önbellek ve sınıflandırıcı devre dışı (önbellekteki soru için bile)
    {
      const before = { clf: classifierCalls, chat: chatCalls.openai };
      const r = await chat(SESSION_A, { provider: 'openai', model: 'gpt-4o', message: "Türkiye'nin başkenti neresidir?", mode: 'baseline' });
      assert(r.data.telemetry.mode === 'baseline' && r.data.telemetry.cacheHit === false, 'Baseline modunda önbellek kullanılmamalıdır');
      assert(classifierCalls === before.clf && chatCalls.openai === before.chat + 1, 'Baseline modunda sınıflandırıcı çağrılmamalı, sohbet API çağrılmalıdır');
    }

    // 10. Oturum izolasyonu: B kullanıcısının OpenAI anahtarı yok → A'nın anahtarı kullanılmaz
    {
      const r = await chat(SESSION_B, { provider: 'openai', model: 'gpt-4o', message: 'Merhaba', mode: 'baseline' });
      assert(r.status === 400, 'Başka oturumun API anahtarı kullanılmamalıdır');
    }
  } finally {
    server.close();
  }

  console.log(`✅ L1 uçtan uca akış testleri başarıyla tamamlandı: ${passed} onay geçti.`);
  return { passed, failed };
}
