import { ExactCacheService } from '../server/services/cache/exactCache.js';
import { generateExactCacheKey, normalizeText } from '../server/services/cache/cacheKey.js';
import { InMemoryStorageMock } from '../server/services/cache/mysqlClient.js';
import { validateResponseForCache } from '../server/services/cache/responseValidator.js';
import type { ClassificationDecision } from '../server/services/cache/cacheTypes.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
  }
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runCacheTests() {
  console.log('\n--- 2. L1 EXACT CACHE VE MYSQL DEPOLAMA TESTLERİ ---');

  const mockStorage = new InMemoryStorageMock();
  const cache = new ExactCacheService(mockStorage);

  // A. Cache Key & Normalization Tests
  {
    const k1 = generateExactCacheKey({ prompt: "Türkiye'nin başkenti neresidir?" });
    const k2 = generateExactCacheKey({ prompt: "  Türkiye'nin   başkenti   neresidir?  " });
    const k3 = generateExactCacheKey({ prompt: "TÜRKİYE'NİN BAŞKENTİ NERESİDİR?" });

    assert(k1.key === k2.key, 'Boşluk ve trim normalizasyonu deterministik aynı anahtarı üretmelidir');
    assert(k1.key === k3.key, 'Türkçe harf duyarlı lowercase katlama aynı anahtarı üretmelidir');
    const k4 = generateExactCacheKey({ prompt: "türkiye'nin başkenti neresidir" });
    assert(k1.key === k4.key, 'Sondaki soru işareti farkı aynı anahtarı üretmelidir');
    const k5 = generateExactCacheKey({ prompt: "Türkiye'nin başkenti neresidir? Kısaca." });
    assert(k1.key !== k5.key, 'Sondaki noktalama dışında metin farkı farklı anahtar üretmelidir');
    assert(normalizeText('2.5 nedir?') === '2.5 nedir' && normalizeText('Pi 3.14') === 'pi 3.14', 'İçerideki noktalama korunmalıdır');

    // Instructions differentiate keys
    const kShort = generateExactCacheKey({ prompt: 'Fotosentezi anlat.', instructions: 'kısaca anlat' });
    const kAcademic = generateExactCacheKey({ prompt: 'Fotosentezi anlat.', instructions: 'akademik düzeyde çok ayrıntılı anlat' });
    assert(kShort.key !== kAcademic.key, 'Farklı talimatlar (kısaca vs akademik) farklı önbellek anahtarları üretmelidir');
  }

  // B. Cross-Provider & Cross-Model L1 Cache Flow (OpenAI MISS -> MySQL Store -> Gemini HIT)
  {
    await mockStorage.flushall();

    const prompt = "Fransa'nın başkenti neresidir?";
    const generalDecision: ClassificationDecision = {
      kategori: 'genel',
      kisisel_bagimlilik: false,
      degisken_bilgi_gerekiyor: false,
      yeni_cikti_bekleniyor: false,
      model_bagimliligi: false,
      tekrar_kullanilabilir: true,
      karar_belirsiz: false,
      gerekce: 'Genel coğrafi bilgi.'
    };

    // Step 1: User 1 asks via OpenAI -> MISS
    const lookup1 = await cache.lookup({ prompt });
    assert(!lookup1.hit && lookup1.status === 'MISS', 'İlk istekte Depolama MISS dönmelidir');

    // OpenAI produces answer
    const openaiContent = "Fransa'nın başkenti Paris'tir.";
    const storeSuccess = await cache.store({
      prompt,
      content: openaiContent,
      sourceProvider: 'openai',
      sourceModel: 'gpt-4o',
      originalUsage: { inputTokens: 12, outputTokens: 8, thinkingTokens: 0, totalTokens: 20 },
      classification: generalDecision
    });
    assert(storeSuccess === 'stored', 'OpenAI yanıtı başarıyla MySQL L1 kalıcı önbelleğine kaydedilmelidir');

    // Step 2: User 2 asks same question via Google Gemini -> HIT!
    const lookup2 = await cache.lookup({ prompt });
    assert(lookup2.hit && lookup2.status === 'HIT', 'İkinci kullanıcı Gemini seçse dahi L1 HIT almalıdır');
    assert(lookup2.entry?.content === openaiContent, 'Önbellekteki OpenAI yanıtı birebir dönmelidir');
    assert(lookup2.entry?.sourceProvider === 'openai' && lookup2.entry?.sourceModel === 'gpt-4o', 'Kaynak sağlayıcı ve model OpenAI/gpt-4o olarak kayıtlı kalmalıdır');

    // Step 3: User 3 asks via Groq -> HIT!
    const lookup3 = await cache.lookup({ prompt });
    assert(lookup3.hit && lookup3.status === 'HIT', 'Groq ile gelen üçüncü kullanıcı da L1 HIT almalıdır');
  }

  // C. Different Prompt -> MISS
  {
    const lookupDiff = await cache.lookup({ prompt: "İspanya'nın başkenti neresidir?" });
    assert(!lookupDiff.hit && lookupDiff.status === 'MISS', 'Farklı soru sorulduğunda MISS dönmelidir');
  }

  // D. Varsayılan: kayıtlar süresiz. TTL verilirse süre dolunca HIT vermez (MySQL'de expires_at)
  {
    await mockStorage.flushall();
    const prompt = 'Güneş sistemindeki en büyük gezegen hangisidir?';
    const astro: ClassificationDecision = {
      kategori: 'genel',
      kisisel_bagimlilik: false,
      degisken_bilgi_gerekiyor: false,
      yeni_cikti_bekleniyor: false,
      model_bagimliligi: false,
      tekrar_kullanilabilir: true,
      karar_belirsiz: false,
      gerekce: 'Astronomi bilgisi.'
    };
    await cache.store({
      prompt,
      content: 'Güneş sistemindeki en büyük gezegen Jüpiter’dir.',
      sourceProvider: 'gemini',
      sourceModel: 'gemini-2.0-flash',
      originalUsage: { inputTokens: 10, outputTokens: 10, thinkingTokens: 0, totalTokens: 20 },
      classification: astro,
    });

    const immediate = await cache.lookup({ prompt });
    assert(immediate.hit, 'Kayıt hemen sonra HIT olmalıdır');
    assert(immediate.entry?.expiresAt === null, 'Varsayılan ayarda kaydın bitiş tarihi olmamalıdır (süresiz)');

    // Çok kısa TTL ile yazılan kayıt süresi dolunca MISS vermelidir
    const shortPrompt = 'Ay Dünya etrafında kaç günde döner?';
    await cache.store({
      prompt: shortPrompt,
      content: 'Ay, Dünya etrafındaki turunu yaklaşık 27,3 günde tamamlar.',
      sourceProvider: 'openai',
      sourceModel: 'gpt-4o',
      originalUsage: { inputTokens: 10, outputTokens: 10, thinkingTokens: 0, totalTokens: 20 },
      classification: astro,
      ttlSeconds: 0.01,
    });
    await new Promise(r => setTimeout(r, 30));
    const expired = await cache.lookup({ prompt: shortPrompt });
    assert(!expired.hit && expired.status === 'MISS', 'TTL sona erince kayıt MISS dönmelidir');
  }

  // D2. Politika sürümü: eski (v1, Gemini dönemi) kayıtlar yeni politikada kullanılmaz
  {
    await mockStorage.flushall();
    const prompt = 'Suyun kaynama noktası kaç derecedir?';
    await cache.store({
      prompt,
      content: 'Deniz seviyesinde su 100 °C’de kaynar.',
      sourceProvider: 'openai',
      sourceModel: 'gpt-4o',
      originalUsage: { inputTokens: 10, outputTokens: 10, thinkingTokens: 0, totalTokens: 20 },
      classification: {
        kategori: 'genel', kisisel_bagimlilik: false, degisken_bilgi_gerekiyor: false, yeni_cikti_bekleniyor: false,
        model_bagimliligi: false, tekrar_kullanilabilir: true, karar_belirsiz: false, gerekce: 'eski kayıt',
      },
      policyVersion: 'v1',
    });
    const lookupNew = await cache.lookup({ prompt });
    assert(!lookupNew.hit, 'v1 politikasıyla yazılmış kayıt güncel politikada HIT vermemelidir');
  }

  // E. Non-Cacheable Queries (Kişisel & Değişken)
  {
    await mockStorage.flushall();
    const personalPrompt = 'Benim doğum günüm ne zaman?';
    const personalStored = await cache.store({
      prompt: personalPrompt,
      content: 'Doğum gününüz 15 Mayıs.',
      sourceProvider: 'openai',
      sourceModel: 'gpt-4o',
      originalUsage: { inputTokens: 10, outputTokens: 10, thinkingTokens: 0, totalTokens: 20 },
      classification: {
        kategori: 'kisisel',
        kisisel_bagimlilik: true,
        degisken_bilgi_gerekiyor: false,
        yeni_cikti_bekleniyor: false,
        model_bagimliligi: false,
        tekrar_kullanilabilir: false,
        karar_belirsiz: false,
        gerekce: 'Kişisel bilgi.'
      }
    });
    assert(personalStored === 'skipped', 'Kişisel soru asla önbelleğe kaydedilmemelidir');

    const personalLookup = await cache.lookup({ prompt: personalPrompt });
    assert(!personalLookup.hit, 'Kişisel soru Depolama kaydında bulunmamalıdır');
  }

  // F. Sanatsal istek ve rastgele çıktı önbelleğe yazılmaz (yeni politika: yalnızca 'genel')
  {
    const poemPrompt = 'Bana dostluk üzerine 4 kıtalık şiir yaz.';
    const poemStored = await cache.store({
      prompt: poemPrompt,
      content: 'Dostluk bir ışıktır karanlık yolda...',
      sourceProvider: 'groq',
      sourceModel: 'llama3-70b-8192',
      originalUsage: { inputTokens: 15, outputTokens: 40, thinkingTokens: 0, totalTokens: 55 },
      classification: {
        kategori: 'sanatsal',
        kisisel_bagimlilik: false,
        degisken_bilgi_gerekiyor: false,
        yeni_cikti_bekleniyor: true,
        model_bagimliligi: false,
        tekrar_kullanilabilir: false,
        karar_belirsiz: false,
        gerekce: 'Sanatsal istek.'
      }
    });
    assert(poemStored === 'skipped', 'Sanatsal istek (şiir) önbelleğe kaydedilmemelidir');

    const randomPrompt = 'Bana rastgele 5 sayı üret.';
    const randomStored = await cache.store({
      prompt: randomPrompt,
      content: '4, 17, 23, 89, 92',
      sourceProvider: 'openai',
      sourceModel: 'gpt-4o',
      originalUsage: { inputTokens: 10, outputTokens: 10, thinkingTokens: 0, totalTokens: 20 },
      classification: {
        kategori: 'degisken',
        kisisel_bagimlilik: false,
        degisken_bilgi_gerekiyor: false,
        yeni_cikti_bekleniyor: true,
        model_bagimliligi: false,
        tekrar_kullanilabilir: false,
        karar_belirsiz: false,
        gerekce: 'Rastgele çıktı talebi.'
      }
    });
    assert(randomStored === 'skipped', 'Rastgele çıktı talebi önbelleğe kaydedilmemelidir');
  }

  // G. Response Validator Checks (Boş, Hata, Hassas Veri Sızıntısı)
  {
    assert(!validateResponseForCache('test', '').isValid, 'Boş yanıt reddedilmelidir');
    assert(!validateResponseForCache('test', 'abc').isValid, '5 karakterden kısa yanıt reddedilmelidir');
    assert(!validateResponseForCache('test', '503 Service Unavailable, model şu anda yoğun.').isValid, 'Hata mesajı reddedilmelidir');
    assert(!validateResponseForCache('test', 'Burada API anahtarın: sk-1234567890abcdef1234567890abcdef').isValid, 'API anahtarı sızıntısı içeren yanıt reddedilmelidir');
    assert(validateResponseForCache('Fotosentez nedir?', 'Fotosentez, bitkilerin ışık enerjisini kimyasal enerjiye dönüştürdüğü biyokimyasal bir süreçtir.').isValid, 'Geçerli yanıt onaylanmalıdır');
  }

  // H. Corrupt Data Resilience
  {
    const corruptStorage = {
      isAvailable: () => true,
      get: async () => { throw new Error('DB Syntax error or corrupted row'); },
      set: async () => true,
      del: async () => true,
      quit: async () => {},
    };
    const corruptCache = new ExactCacheService(corruptStorage);
    const corruptLookup = await corruptCache.lookup({ prompt: 'Bozuk veri testi' });
    assert(!corruptLookup.hit && corruptLookup.status === 'BYPASS' && corruptLookup.bypassReason === 'DB_UNAVAILABLE', 'Bozuk veri veya DB hatası güvenle yakalanıp BYPASS dönmelidir');
  }

  // I. Offline / Disconnected Database -> BYPASS
  {
    const offlineStorage = {
      isAvailable: () => false,
      get: async () => null,
      set: async () => false,
      del: async () => false,
      quit: async () => {},
    };
    const offlineCache = new ExactCacheService(offlineStorage);

    const bypassLookup = await offlineCache.lookup({ prompt: 'Herhangi bir soru' });
    assert(!bypassLookup.hit && bypassLookup.status === 'BYPASS' && bypassLookup.bypassReason === 'DB_UNAVAILABLE', 'Veritabanına erişilemediğinde uygulama çökmemeli ve BYPASS dönmelidir');
  }

  // J. Concurrency Race Condition Safety
  {
    await mockStorage.flushall();
    const prompt = 'Eşzamanlı yarış koşulu testi';
    const storePromises = [1, 2, 3, 4, 5].map(i =>
      cache.store({
        prompt,
        content: `Yanıt versiyon ${i}`,
        sourceProvider: 'openai',
        sourceModel: 'gpt-4o',
        originalUsage: { inputTokens: 5, outputTokens: 5, thinkingTokens: 0, totalTokens: 10 },
        classification: {
          kategori: 'genel',
          kisisel_bagimlilik: false,
          degisken_bilgi_gerekiyor: false,
          yeni_cikti_bekleniyor: false,
          model_bagimliligi: false,
          tekrar_kullanilabilir: true,
          karar_belirsiz: false,
          gerekce: 'Eşzamanlı test.'
        }
      })
    );

    const results = await Promise.all(storePromises);
    assert(results.every(r => r === 'stored'), 'Eşzamanlı kayıt istekleri yarış koşulu oluşturmadan güvenle tamamlanmalıdır');

    const finalLookup = await cache.lookup({ prompt });
    assert(finalLookup.hit, 'Eşzamanlı yazmalardan sonra önbellek geçerli kayda sahip olmalıdır');
  }

  console.log(`✅ L1 Exact Cache testleri başarıyla tamamlandı: ${passed} onay geçti.`);
  return { passed, failed };
}

import url from 'node:url';

const isMain = process.argv[1] && url.fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();
if (isMain) {
  runCacheTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
