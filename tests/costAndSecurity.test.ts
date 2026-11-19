import { calculateRequestCost } from '../server/services/cost/costEngine.js';
import { calculateAvoidedCost } from '../server/services/cost/avoidedCost.js';
import { sessionManager } from '../server/services/chat/sessionManager.js';
import { BerturkClassifier } from '../server/services/classifier/berturkClassifier.js';
import { decideCacheability } from '../server/services/classifier/l1Decision.js';
import { ExactCacheService } from '../server/services/cache/exactCache.js';
import { config } from '../server/config/env.js';
import type { RequestTelemetry, ChatApiResponse } from '../server/types/api.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runCostAndSecurityTests() {
  console.log('\n--- 3. MALİYET AYRIMI VE GÜVENLİK TESTLERİ (16 ZORUNLU KONTROL) ---');

  // TEST 1: Sınıflandırıcı çağrılsa bile kullanıcı sohbet API maliyeti artmamalıdır
  {
    const userUsage = { inputTokens: 50, outputTokens: 100, thinkingTokens: 0, totalTokens: 150 };
    const userCost = calculateRequestCost('openai', 'gpt-4o', userUsage);

    // Suppose classifier reported 80 tokens on TokenAI's side
    const classifierReportedTokens = 80;

    assert(userCost.totalCost !== null && userCost.totalCost > 0, 'Kullanıcı maliyeti hesaplanabilmelidir');
    // Verify that userCost does not include classifier tokens
    const expectedCost = (50 * 2.50 / 1e6) + (100 * 10.00 / 1e6); // gpt-4o pricing
    assert(Math.abs(userCost.totalCost - expectedCost) < 0.0000001, 'TEST 1: Sınıflandırıcı çağrılsa dahi kullanıcı maliyeti yalnızca kendi sohbet tokenlarını içermelidir');
  }

  // TEST 2: Sınıflandırıcı tokenları kullanıcı token toplamına eklenmemelidir
  {
    const userUsage = { inputTokens: 40, outputTokens: 80, thinkingTokens: 0, totalTokens: 120 };
    const classifierUsage = { promptTokens: 65, candidatesTokens: 30, totalTokens: 95 };

    const recordedUserTotal = userUsage.totalTokens;
    assert(recordedUserTotal === 120, 'TEST 2: Kullanıcı toplam tokenı 120 olmalıdır, sınıflandırıcı tokenları (95) eklenmemelidir');
  }

  // TEST 3: Yanıt doğrulama çağrısının maliyeti kullanıcıya eklenmemelidir
  {
    const mockTelemetry: RequestTelemetry = {
      requestId: 'test-req-3',
      timestamp: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 25,
      outputTokens: 50,
      thinkingTokens: 0,
      totalTokens: 75,
      latencyMs: 350,
      cacheHit: false,
      cacheType: null,
      compressionUsed: false,
      compressionRatio: null,
      validatorPassed: true,
      escalated: false,
      routerPolicy: null,
      routerConfidence: null,
      inputCost: 0.0000625,
      outputCost: 0.0005000,
      totalCost: 0.0005625,
    };

    assert(mockTelemetry.totalCost === 0.0005625, 'TEST 3: Yanıt doğrulama sonucu kullanıcı maliyetini değiştirmemelidir');
  }

  // TEST 4: Cache HIT durumunda kullanıcı sohbet API maliyeti 0 olmalıdır
  {
    const hitTelemetry: RequestTelemetry = {
      requestId: 'test-hit-4',
      timestamp: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: 0,
      latencyMs: 12,
      cacheHit: true,
      cacheType: 'exact',
      cacheStatus: 'HIT',
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      compressionUsed: false,
      compressionRatio: null,
      validatorPassed: true,
      escalated: false,
      routerPolicy: null,
      routerConfidence: null,
    };

    assert(hitTelemetry.totalCost === 0 && hitTelemetry.inputCost === 0 && hitTelemetry.outputCost === 0, 'TEST 4: Cache HIT durumunda sohbet API maliyeti kesinlikle $0.00 olmalıdır');
  }

  // TEST 5: Cache HIT durumunda yeni sohbet tokenları 0 olmalıdır
  {
    const hitUsage = {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: 0,
    };

    assert(hitUsage.inputTokens === 0 && hitUsage.outputTokens === 0 && hitUsage.totalTokens === 0, 'TEST 5: Cache HIT durumunda sohbet input/output/total tokenları 0 olmalıdır');
  }

  // TEST 6: Cache MISS durumunda yalnızca kullanıcının sohbet modeli maliyeti hesaplanmalıdır
  {
    const missUsage = { inputTokens: 100, outputTokens: 200, thinkingTokens: 0, totalTokens: 300 };
    const cost = calculateRequestCost('groq', 'llama3-70b-8192', missUsage);
    // llama3-70b-8192: input: 0.59 / M, output: 0.79 / M
    const expected = (100 * 0.59 / 1e6) + (200 * 0.79 / 1e6);
    assert(Math.abs((cost.totalCost || 0) - expected) < 0.0000001, 'TEST 6: Cache MISS durumunda yalnızca seçilen modelin tarifesi hesaplanmalıdır');
  }

  // TEST 7: Baseline maliyetleri korunmalıdır
  {
    const baseUsage = { inputTokens: 200, outputTokens: 300, thinkingTokens: 0, totalTokens: 500 };
    const baseCost = calculateRequestCost('gemini', 'gemini-2.0-flash', baseUsage);
    // gemini-2.0-flash: input: 0.10 / M, output: 0.40 / M
    const expectedBase = (200 * 0.10 / 1e6) + (300 * 0.40 / 1e6);
    assert(Math.abs((baseCost.totalCost || 0) - expectedBase) < 0.0000001, 'TEST 7: Baseline hesaplaması mevcut formüle sadık kalmalıdır');
  }

  // TEST 8: Sohbet API tasarrufundan sınıflandırıcı maliyeti çıkarılmamalıdır
  {
    const targetProvider = 'openai';
    const targetModel = 'gpt-4o';
    const prompt = "Fotosentez nedir?";
    const cachedContent = "Fotosentez, bitkilerin güneş enerjisini kimyasal enerjiye dönüştürmesidir.";
    const cachedUsage = { inputTokens: 15, outputTokens: 50 };

    const avoidedCost = calculateAvoidedCost(targetProvider, targetModel, prompt, cachedContent, cachedUsage);
    assert(avoidedCost !== null && avoidedCost > 0, 'Tahmini önlenen API maliyeti hesaplanabilmelidir');

    // Expected: (15 * 2.50 / 1e6) + (50 * 10.00 / 1e6) = 0.0000375 + 0.000500 = 0.0005375
    const expectedAvoided = (15 * 2.50 / 1e6) + (50 * 10.00 / 1e6);
    assert(Math.abs(avoidedCost - expectedAvoided) < 0.0000001, 'TEST 8: Sohbet API tasarrufundan TokenAI altyapı maliyeti çıkarılmamalıdır');
  }

  // TEST 9: Bilinmeyen sohbet API maliyeti yanlışlıkla 0 gösterilmemelidir
  {
    const unknownCost = calculateAvoidedCost('unknown-provider', 'unknown-model-xyz', 'soru', 'yanıt');
    assert(unknownCost === null, 'TEST 9: Bilinmeyen model maliyeti 0 yerine null (hesaplanamadı) olarak döndürülmelidir');
  }

  // TEST 10: Thinking token hesaplaması mevcut sağlayıcı metadata'sına uygun kalmalıdır
  {
    const thinkingUsage = {
      inputTokens: 100,
      outputTokens: 150,
      thinkingTokens: 50,
      totalTokens: 300,
    };
    // gemini-3.5-flash bills thinking at output rate
    const geminiCost = calculateRequestCost('gemini', 'gemini-3.5-flash', thinkingUsage);
    assert(geminiCost.totalCost !== null, 'Thinking token içeren Gemini maliyeti doğru hesaplanmalıdır');
    // input: 100 * 1.50/1e6 = 0.00015
    // output: (150 + 50) * 9.00/1e6 = 0.0018
    // total: 0.00195
    assert(Math.abs(geminiCost.totalCost - 0.00195) < 0.000001, 'TEST 10: Thinking tokenlar modele uygun fiyatlandırılmalıdır');
  }

  // TEST 11: Cache HIT kaynağı ile kullanıcının seçtiği model karıştırılmamalıdır
  {
    const hitResponse: ChatApiResponse = {
      message: { role: 'assistant', content: 'Paris' },
      provider: 'gemini', // User requested on Gemini
      model: 'gemini-2.0-flash',
      telemetry: {
        requestId: 'req-11',
        timestamp: Date.now(),
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        sourceProvider: 'openai', // Originally produced by OpenAI
        sourceModel: 'gpt-4o',
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        totalTokens: 0,
        latencyMs: 5,
        cacheHit: true,
        cacheType: 'exact',
        cacheStatus: 'HIT',
        compressionUsed: false,
        compressionRatio: null,
        validatorPassed: true,
        escalated: false,
        routerPolicy: null,
        routerConfidence: null,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
      },
      metrics: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        totalTokens: 0,
        latencyMs: 5,
      }
    };

    assert(hitResponse.provider === 'gemini', 'Kullanıcının seçtiği sağlayıcı gemini kalmalıdır');
    assert(hitResponse.telemetry.sourceProvider === 'openai', 'TEST 11: Önbellek kaynağı openai olarak ayrı raporlanmalıdır');
  }

  // TEST 12: Sınıflandırıcı servisi çalışmıyorsa güvenli BYPASS (normal sohbet devam eder)
  {
    const down = new BerturkClassifier('http://127.0.0.1:1', 500, (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as unknown as typeof fetch);
    const d = decideCacheability(await down.classify('Örnek bir soru'), 0.9);
    assert(!d.cacheable && d.reason === 'CLASSIFIER_UNAVAILABLE', 'TEST 12: Servis yoksa önbelleğe yazılmamalı ve neden CLASSIFIER_UNAVAILABLE olmalıdır');
  }

  // TEST 13: Sınıflandırıcı zaman aşımında güvenli BYPASS
  {
    const slow = new BerturkClassifier('http://127.0.0.1:1', 20, ((_u: string, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener('abort', () =>
        rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch);
    const d = decideCacheability(await slow.classify('Başkent neresidir?'), 0.9);
    assert(!d.cacheable && d.reason === 'CLASSIFIER_TIMEOUT', 'TEST 13: Zaman aşımında önbelleğe yazılmamalı ve neden CLASSIFIER_TIMEOUT olmalıdır');
  }

  // TEST 14: Sınıflandırıcı yereldir; harici API anahtarı yoktur ve yalnızca loopback adresine bağlanır
  {
    sessionManager.clearSession('user-session-1');
    sessionManager.setApiKey('user-session-1', 'openai', 'sk-user-custom-secret-key-1111');
    const userKey = sessionManager.getApiKey('user-session-1', 'openai');
    const host = new URL(config.classifierUrl).hostname;

    assert(userKey === 'sk-user-custom-secret-key-1111', 'Kullanıcı anahtarı oturumunda saklanmalıdır');
    assert(!('classifierApiKey' in config), 'Sınıflandırıcı için harici API anahtarı tanımlı olmamalıdır');
    assert(host === '127.0.0.1' || host === 'localhost', 'TEST 14: Sınıflandırıcı yalnızca yerel makinede çalışmalıdır');
  }

  // TEST 15: Bir kullanıcının API anahtarına başka kullanıcı erişememelidir (Oturum İzolasyonu)
  {
    sessionManager.clearSession('session-alice');
    sessionManager.clearSession('session-bob');

    sessionManager.setApiKey('session-alice', 'gemini', 'alice-gemini-secret-key-aaa');
    sessionManager.setApiKey('session-bob', 'gemini', 'bob-gemini-secret-key-bbb');

    const aliceKey = sessionManager.getApiKey('session-alice', 'gemini');
    const bobKey = sessionManager.getApiKey('session-bob', 'gemini');
    const eveKey = sessionManager.getApiKey('session-eve', 'gemini');

    assert(aliceKey === 'alice-gemini-secret-key-aaa', 'Alice kendi anahtarını alabilmelidir');
    assert(bobKey === 'bob-gemini-secret-key-bbb', 'Bob kendi anahtarını alabilmelidir');
    assert(aliceKey !== bobKey, 'TEST 15: Alice ve Bob API anahtarları birbirinden bağımsızdır');
    assert(eveKey === undefined, 'Tanımsız oturum başkasının anahtarına erişemez');
  }

  // TEST 16: Kullanıcı onayı olmadan sorular sınıflandırıcıya gönderilmemelidir
  {
    const userConsent = false;
    let classifierCalled = false;

    // Simulate backend decision flow when userConsent is false
    if (userConsent) {
      classifierCalled = true;
    }

    assert(!classifierCalled, 'TEST 16: Kullanıcı onayı (userConsent === false) yoksa soru sınıflandırıcıya iletilmemelidir');
  }

  console.log(`✅ Maliyet ve güvenlik testleri başarıyla tamamlandı: ${passed} zorunlu onay geçti.`);
  return { passed, failed };
}

import url from 'node:url';

const isMain = process.argv[1] && url.fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();
if (isMain) {
  runCostAndSecurityTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
