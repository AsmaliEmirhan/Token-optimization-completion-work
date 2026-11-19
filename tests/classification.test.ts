import { BerturkClassifier, parseClassifierResponse } from '../server/services/classifier/berturkClassifier.js';
import { decideCacheability } from '../server/services/classifier/l1Decision.js';

/**
 * Yerel BERTurk sınıflandırıcı istemcisi ve önbellek karar mantığı testleri.
 * Gerçek model çağrılmaz; servis yanıtları taklit edilir (modelin kendisi ml/reports/report.md ile değerlendirilir).
 * Not: Buradaki örnek sorular sadece doğrulama içindir; uygulamada kural/whitelist olarak kullanılmaz.
 */

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

type Probs = { genel: number; kisisel: number; degisken: number; sanatsal: number };

function svc(probs: Probs, overrides: Record<string, unknown> = {}) {
  const label = (Object.keys(probs) as (keyof Probs)[]).reduce((a, b) => (probs[b] > probs[a] ? b : a));
  return { label, probs, p_genel: probs.genel, model_version: 'berturk-l1-test', tau: 0.5, latency_ms: 12, truncated: false, ...overrides };
}

function mockFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

export async function runClassificationTests() {
  console.log('\n--- 1. BERTurk SINIFLANDIRICI VE ÖNBELLEK KARAR TESTLERİ ---');
  const TAU = 0.9;

  // 1. Emin "genel" → önbelleğe alınabilir
  {
    const r = parseClassifierResponse(svc({ genel: 0.97, kisisel: 0.01, degisken: 0.01, sanatsal: 0.01 }));
    const d = decideCacheability(r, TAU);
    assert(r.ok && d.cacheable && d.category === 'genel' && d.reason === null, 'Emin genel soru önbelleğe alınabilmelidir');
    assert(d.decision?.tekrar_kullanilabilir === true && d.decision.karar_belirsiz === false, 'Karar nesnesi tutarlı olmalıdır');
  }

  // 2. "genel" ama eşiğin altında → LOW_CONFIDENCE
  {
    const d = decideCacheability(parseClassifierResponse(svc({ genel: 0.7, kisisel: 0.1, degisken: 0.15, sanatsal: 0.05 })), TAU);
    assert(!d.cacheable && d.reason === 'LOW_CONFIDENCE' && d.decision?.karar_belirsiz === true, 'Eşiğin altındaki genel tahmin önbelleğe alınmamalıdır');
  }

  // 3-5. Kişisel / değişken / sanatsal → her biri kendi nedeniyle BYPASS
  {
    const k = decideCacheability(parseClassifierResponse(svc({ genel: 0.02, kisisel: 0.95, degisken: 0.02, sanatsal: 0.01 })), TAU);
    const v = decideCacheability(parseClassifierResponse(svc({ genel: 0.03, kisisel: 0.02, degisken: 0.94, sanatsal: 0.01 })), TAU);
    const s = decideCacheability(parseClassifierResponse(svc({ genel: 0.01, kisisel: 0.01, degisken: 0.01, sanatsal: 0.97 })), TAU);
    assert(!k.cacheable && k.reason === 'CATEGORY_KISISEL', 'Kişisel soru CATEGORY_KISISEL ile BYPASS olmalıdır');
    assert(!v.cacheable && v.reason === 'CATEGORY_DEGISKEN', 'Değişken soru CATEGORY_DEGISKEN ile BYPASS olmalıdır');
    assert(!s.cacheable && s.reason === 'CATEGORY_SANATSAL', 'Sanatsal istek CATEGORY_SANATSAL ile BYPASS olmalıdır');
  }

  // 6. Eşik 1.01 → hiçbir şey önbelleğe alınmaz (acil kapatma)
  {
    const d = decideCacheability(parseClassifierResponse(svc({ genel: 0.999, kisisel: 0.0005, degisken: 0.0003, sanatsal: 0.0002 })), 1.01);
    assert(!d.cacheable && d.reason === 'LOW_CONFIDENCE', 'τ=1.01 iken en emin genel soru bile önbelleğe alınmamalıdır');
  }

  // 7. Geçersiz / çelişkili servis yanıtları reddedilir
  {
    const unknownLabel = parseClassifierResponse({ ...svc({ genel: 0.9, kisisel: 0.05, degisken: 0.03, sanatsal: 0.02 }), label: 'diger' });
    const badSum = parseClassifierResponse(svc({ genel: 0.9, kisisel: 0.5, degisken: 0.1, sanatsal: 0.1 }));
    const wrongArgmax = parseClassifierResponse({ ...svc({ genel: 0.2, kisisel: 0.7, degisken: 0.05, sanatsal: 0.05 }), label: 'genel' });
    const pGenelMismatch = parseClassifierResponse({ ...svc({ genel: 0.95, kisisel: 0.03, degisken: 0.01, sanatsal: 0.01 }), p_genel: 0.5 });
    const missingProbs = parseClassifierResponse({ label: 'genel', p_genel: 0.99, model_version: 'x' });
    const notObject = parseClassifierResponse('genel');
    for (const [r, name] of [[unknownLabel, 'bilinmeyen etiket'], [badSum, 'toplam≠1'], [wrongArgmax, 'etiket≠argmax'],
                             [pGenelMismatch, 'p_genel tutarsız'], [missingProbs, 'probs eksik'], [notObject, 'nesne değil']] as const) {
      assert(!r.ok && r.reason === 'CLASSIFIER_INVALID_RESPONSE', `Geçersiz yanıt reddedilmelidir: ${name}`);
      assert(!decideCacheability(r, TAU).cacheable, `Geçersiz yanıtta önbellek kapalı kalmalıdır: ${name}`);
    }
  }

  // 8. HTTP istemcisi: başarılı yanıt, HTTP hatası, bağlantı hatası
  {
    const ok = await new BerturkClassifier('http://127.0.0.1:8765', 1000,
      mockFetch(svc({ genel: 0.96, kisisel: 0.02, degisken: 0.01, sanatsal: 0.01 }))).classify('Fotosentez nasıl gerçekleşir?');
    assert(ok.ok && ok.label === 'genel' && ok.modelVersion === 'berturk-l1-test', 'Başarılı servis yanıtı ayrıştırılmalıdır');

    const http500 = await new BerturkClassifier('http://127.0.0.1:8765', 1000, mockFetch({ error: 'x' }, 500)).classify('soru');
    assert(!http500.ok && http500.reason === 'CLASSIFIER_INVALID_RESPONSE', 'HTTP 500 geçersiz yanıt olarak raporlanmalıdır');

    const refused = await new BerturkClassifier('http://127.0.0.1:1', 1000, (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as unknown as typeof fetch).classify('soru');
    assert(!refused.ok && refused.reason === 'CLASSIFIER_UNAVAILABLE' && refused.detail === 'ECONNREFUSED', 'Bağlantı hatası CLASSIFIER_UNAVAILABLE olarak raporlanmalıdır');
  }

  // 9. Farklı hata türleri aynı etikete indirgenmez (eski BYPASS sorununun tekrarını önler)
  {
    const reasons = new Set([
      decideCacheability({ ok: false, reason: 'CLASSIFIER_UNAVAILABLE', detail: '' }, TAU).reason,
      decideCacheability({ ok: false, reason: 'CLASSIFIER_TIMEOUT', detail: '' }, TAU).reason,
      decideCacheability({ ok: false, reason: 'CLASSIFIER_INVALID_RESPONSE', detail: '' }, TAU).reason,
      decideCacheability(parseClassifierResponse(svc({ genel: 0.02, kisisel: 0.95, degisken: 0.02, sanatsal: 0.01 })), TAU).reason,
    ]);
    assert(reasons.size === 4, 'Servis hatası ile kişisel soru aynı neden gibi gösterilmemelidir');
  }

  console.log(`✅ Sınıflandırıcı testleri başarıyla tamamlandı: ${passed} onay geçti.`);
  return { passed, failed };
}

import url from 'node:url';

const isMain = process.argv[1] && url.fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();
if (isMain) {
  runClassificationTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
