# Hibrit doğrulamalı ortak L1 — uygulama ve doğrulama

## 1. Genel özet

Üç tam soruyu onaylayan eski liste kaldırıldı. Şema doğrulaması ve sunucu oturumundan sonra
istek sınıflandırılır; paylaşım için olumlu kanıt gereklidir. Ortak adayın cevabı üretimden sonra
ayrıca doğrulanır. Belirsiz cevap özel kalır; hassas, eksik veya beklenmeyen araç çıktısı saklanmaz.
Depo hâlâ süreç belleğindedir; PostgreSQL, Redis, embeddings, L2, router veya tam auth eklenmedi.

## 2. Mimari

Akış: istek şeması → doğrulanmış oturum → deterministik risk denetimi → kapsam kararı →
gerekirse ek istek doğrulaması → SHA-256 anahtarı → onaylı ortak arama → özel arama →
sağlayıcı → yanıt doğrulaması → uygun kapsamda kayıt.

| Kapsam | Kimlik ve kullanım |
| --- | --- |
| `shared` | Kimliksiz ortak anahtar; hem istek hem yanıt paylaşım onayı gerekir. |
| `session_private` | Sunucunun ayrı ürettiği partitionId + credentialRevision özetinden türetilir. |
| `user_private` | Yalnız güvenilir sunucu auth katmanının issuer/subject/cacheRevision bilgisiyle kullanılabilir. HTTP gövdesinden alınmaz. |

Anonim çerez kullanıcı hesabı değildir. Mevcut uygulama `user_private` üretmez; bu kapsamın
servis sözleşmesi ve izolasyon testleri geleceğe hazırlıktır. Geçmiş içeren istek, auth olsa bile
oturum kapsamındadır. Gelecekte auth bağlanırken kullanıcı yetki/credential değişimlerinde
cacheRevision artırılmalıdır; istemcinin `authenticated: true` iddiası auth kanıtı sayılmaz.

Sınıflandırma üç alanın sınırlı dilbilgisi ve terim sözlüklerine dayanır: başkent bilgisi,
matematik teoremleri ve programlama döngüleri. Bunlar tam soru listeleri değildir.
Sistem/geçmiş/özel parametreler paylaşım dışında tutulur. Dinamik, hassas ve enjeksiyon göstergeleri
bypass sebebidir. Negatif sözcük bulunmaması olumlu onay değildir.

Yerleşik yanıt doğrulaması kasıtlı olarak daha dardır: sözlükle uyuşan tam başkent cümleleri,
Pisagor bağıntısının belirli kısa gösterimleri ve sınırlandırılmış Python for örnekleri.
Örneğin farklı bir teorem veya dil istek aşamasında aday olabilir; yanıtı yerleşik kanıt biçimine
uymuyorsa ek doğrulama gerekir. Uzun bir genel bilgi cevabı yanlış kabul edilmez, yalnızca özel saklanır.
Genişletme sırasında istek ve yanıt kuralları birlikte incelenmeli ve politika sürümü artırılmalıdır.

`CacheSafetyValidator` ayrı `validateRequest` / `validateResponse` metotlarından
`approved`, `rejected`, `uncertain`, reasonCode ve validatorVersion döndürür.
Sunucudan `createApp({ cacheValidator })` veya `ChatService({ validator })` ile bağlanabilir.
Varsayılan ek doğrulayıcı yoktur; yokluk, hata, zaman aşımı ve bozuk sonuç paylaşımı açmaz.
İstek/yanıtın kopyası ve AbortSignal verilir; API anahtarı veya oturum kimliği aktarılmaz.
Bu arayüze bağlanacak gelecekteki hizmetin veri işleme, gecikme ve maliyet politikası ayrıca belirlenmelidir.

Anahtar; şema v3, kapsam/özel kapsam izi, ham sağlayıcı ve model, tam prompt,
sistem ve sıralı konuşma SHA-256 izleri, desteklenen üretim parametreleri, harici bağlam alanları
ve politika + ek doğrulayıcı sürümünü içerir. Prompt boşluğu/yazımı normalize edilmez.
Anahtar eşleşmesi tek başına paylaşım izni değildir. Okumada kayıt kapsamı, sürümü ve kaynak
sağlayıcı/modeli tekrar kontrol edilir. Özel okuma ortak kayıt yazmaz.

## 3. Dosya değişiklikleri

| Dosya | Amaç |
| --- | --- |
| `server/services/cache/cacheTypes.ts` | Kapsam, karar, doğrulama, AnswerRecord ve invalidation sözleşmeleri. |
| `server/services/cache/cacheKey.ts` | Açık alanlarla sürümlü SHA-256; özel/ortak anahtar ayrımı. |
| `server/services/cache/cachePolicy.ts` | Hibrit istek uygunluğu ve sunucu kimliğinden kapsam seçimi. |
| `server/services/cache/cacheValidation.ts` (yeni) | Risk/olumlu kategori kuralları, yanıt kanıtı, ek doğrulayıcı arayüzü ve güvenli çalıştırıcı. |
| `server/services/cache/exactCache.ts` | Ortak kayıt kabul denetimi, kapsam kotaları ve kapsam/sürüm invalidation. |
| `server/services/chat/chatService.ts` | Ortak→özel lookup, üretim sonrası doğrulama, özel fallback ve in-flight izolasyonu. |
| `server/app.ts` | Sunucu doğrulayıcı bağlantısı ve yeni kapasite/zaman aşımı seçenekleri. |
| `server/types/api.ts` | Normalize kapsam, karar, kaynak ve sağlayıcı güvenlik metadatası. |
| `server/services/providers/openai.ts`, `groq.ts`, `gemini.ts` | Tamamlanma, araç/retrieval, özel bağlam ve mevcut güvenlik göstergelerini aktarır. |
| `src/types/telemetry.ts` | Yeni telemetri alanları, eski kaynak değeriyle uyumluluk. |
| `src/components/MainWorkspace.tsx` | Karar/kapsam aktarımı ve requestId tekrarlarını önleme. |
| `src/components/RequestAnalysis.tsx` | Türkçe kapsam/karar/kaynak ve beş durum; gelişmiş bilgi araç ipuçları. |
| `src/components/MetricsPopover.tsx`, `src/utils/metrics.ts` | Ortak/özel/eski hit ayrımı, zaman filtreleri ve tekilleştirilmiş toplamlar. |
| `server/services/cache/cache.test.ts` | Önceki TTL/LRU, izolasyon, maliyet ve eşzamanlılık regresyonları yeni sözleşmeye taşındı. |
| `server/services/cache/hybrid.test.ts` (yeni) | Ortak hit, kategori örnekleri, özel fallback, auth sözleşmesi, sürüm ve validator testleri. |
| `server/services/cache/security.test.ts` (yeni) | Enjeksiyon, hassas yanıt, sahte scope, belirsizlik, zehirleme ve çapraz oturum testleri. |
| `server/services/cache/cacheTestUtils.ts` (yeni) | Ücretsiz/sentetik sağlayıcı, saat ve kayıt fixture'ları. |
| `server/services/providers/providers.test.ts` | Üç SDK'nın güvenlik metadatası ve beklenmeyen araç/retrieval testleri. |
| `server/app.test.ts` | Gerçek yerel HTTP/proxy/çerez sınırında ortak ve özel senaryolar. |
| `tests/frontend.test.tsx`, `tests/metrics.test.ts` | Render, maliyet, zaman filtreleri ve tekrar sayımını önleme testleri. |
| `package.json`, `README.md`, bu belge | Güvenlik test komutu, kullanım ve sınırlar. |

## 4. Örnek senaryolar

Yerel HTTP testinde iki bağımsız çerez ve sahte sağlayıcı anahtarı kullanılır:

| İstek | Sonuç |
| --- | --- |
| A: `Türkiye'nin başkenti` | Miss/provider; doğrulanabilir kısa yanıt ortak saklanır. |
| B: aynı ham metin, aynı sağlayıcı/model | Shared Hit; ikinci sağlayıcı çağrısı yapılmaz. |
| A/B: `Benim favori rengim ne?` | Her oturumun ilk isteği ayrı Miss; tekrar kendi Private Hit kaydını okur. |
| B: `Bugün hava nasıl?` | Bypass/provider. |
| B: ilk soruyu başka modelle sorar | Miss/provider. |
| B: aynı anlamı farklı sözlerle sorar | Ayrı L1 anahtarı; ortak/özel uygunluk ayrıca değerlendirilir. |

Türkçe ve İngilizce örneklerin yanı sıra Norveç/Japonya gibi ek alan girdileri aynı kategori akışıyla
test edildi. Bu gösterim kontrollü sağlayıcı yanıtları kullanır; canlı modelin uzun cevabının ortak
doğrulamayı geçeceği iddia edilmez.

## 5. Güvenlik

HttpOnly/SameSite/HTTPS çerez, Origin/Fetch-Metadata/JSON başlığı denetimleri korunur.
API anahtarı hâlâ yalnız ilgili sunucu oturumunda saklanır; paylaşılan kayıtlara taşınmaz.
İstemci `scope`, `cacheScope`, `cacheSafe`, auth, dosya ve desteklenmeyen araç alanlarıyla
paylaşım izni oluşturamaz. Eski istemci securityScope iddiası doğrulanmış kapsam yerine geçmez.

Ortak aday için sağlayıcı metadatası gereklidir; STOP tek başına yeterli değildir.
Araç/retrieval/özel bağlam/flag veya eksik çıktı paylaşımı kapatır. İçerik risk denetiminden
sonra yanıtın tamamında olumlu kanıt aranır; güvenli bir cümleyle başlayan başka içerik otomatik onaylanmaz.
Paylaşımı reddedilen veya belirsiz sonuç ancak özel saklama denetimlerini de geçerse özel kalır.

**Oturumlar arası in-flight kapalıdır.** Ortak adayın cevabı sonradan hassas çıkabilir;
bu nedenle yalnız aynı doğrulanmış özel kapsamdaki bekleyenler üretimi paylaşır. Eski
`inflight_shared` adı protokol uyumluluğu için korunur ve arayüzde açıklanır. İki oturumda
eşzamanlı soğuk miss iki çağrı yapabilir. Her biri kendi maliyetini taşır.
Üretim hatası/zaman aşımı in-flight kaydını temizler. Clear/invalidation devam eden eski üretimin
cache yazmasını engeller. Doğrulayıcı zaman aşımı ve toplam kabul edilen istek sayısı sınırlıdır.

Regex/alan sözlüğü tam bir saldırı savunması veya semantik güvenlik ispatı değildir.
Yerleşik dar kabul biçimleri riski sınırlar; serbest içerik güvenilir ek doğrulama olmadan paylaşılmaz.
Gelecekte bağlanan doğrulayıcının yanlış onayı hâlâ risktir. Sağlayıcı adapter'larının gizli bağlam
eklememesi ve yeni araç özelliklerinin metadataya taşınması güven sınırının parçasıdır.
Auth, kullanıcı başına kota, kalıcı audit ve dağıtık cache bu aşamada yoktur.

## 6. Token ve maliyet

Cost Engine ve fiyat kaydı değiştirilmedi. Kaynak sağlayıcı/model tam eşleşir; OpenAI yanıtı
Gemini kullanımı olarak gösterilmez. Gerçek sağlayıcı kullanım/maliyeti çağrıyı başlatan isteğe yazılır.
Cache hit veya aynı özel üretimi bekleyen istekte yeni tokenlar ve yeni API maliyeti sıfırdır.
Altyapı maliyeti bilinmiyor (`null`); API maliyeti sıfırı altyapının ücretsiz olduğu anlamına gelmez.

Kaynak kullanım, kaynak requestId ve tahmini önlenen token/maliyet ayrı alanlardır.
Fiyat veya kullanım bilinmiyorsa önlenen maliyet `null` kalır. Önlenen maliyet garanti tasarruf değildir.
Toplam gerçek maliyette bilinen kısım ve eksik kayıt sayısı korunur; tümü bilinmiyorsa “—” gösterilir.
Önlenen toplamda tek bir eksik kullanım/fiyat bile toplamı bilinmiyor yapar.
Tekrarlanan requestId toplamları çoğaltmaz; in-flight bekleyenler L1 hit/miss oranına katılmaz.

## 7. Doğrulama

Çalıştırma komutları:

```text
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run test:security
npm.cmd run test:integration
npm.cmd run test:frontend
npm.cmd run lint
npm.cmd run build
git diff --check
```

19 Ekim 2026 çalıştırma sonuçları:

| Kontrol | Sonuç |
| --- | --- |
| TypeScript typecheck | BAŞARILI; ayrıca üretim derlemesinin içinde tekrar çalıştı. |
| Birim testleri | 42/42 BAŞARILI; Cost Engine dosyasının 50 assertion'ı dahil. |
| Güvenlik testleri | 11/11 BAŞARILI. |
| HTTP entegrasyonu | 13/13 BAŞARILI; gerçek yerel çerez/proxy ve iki oturumlu ortak hit gösterimi dahil. |
| Frontend/render/analitik | 10/10 BAŞARILI. |
| Toplam test sonucu | 76 test, 0 hata, 0 atlanan. |
| Üretim derlemesi | BAŞARILI; Vite 2159 modülü işledi. |
| Lint | Çıkış kodu 0; değiştirilmeyen MarkdownRenderer, ThemeContext ve ChatInput dosyalarındaki mevcut uyarılar sürüyor. |
| Git diff boşluk denetimi | BAŞARILI. |
| Gerçek tarayıcıda görsel kontrol | ÇALIŞTIRILAMADI; bağlı tarayıcı yok. |
| Canlı ücretli API | ÇALIŞTIRILMADI. |

Testler gerçek ücretli API kullanmaz. HTTP testleri gerçek yerel Express ve Vite proxy açar;
SDK testleri fetch'i taklit eder. Cost Engine'in mevcut 50 assertion'ı korunur.
Render testleri RequestAnalysis, MetricsPopover, sağlayıcı ayarları, Markdown ve tema sınıflarını kapsar.
Gerçek tarayıcı görsel kontrolü denendi; ortamda bağlı tarayıcı olmadığından yürütülemedi.
Canlı API uyumluluğu, gerçek sağlayıcı gecikmesi/faturası ve gerçek tarayıcı görünümü doğrulanmış sayılmaz.

Kabul matrisi:

| Gereksinimler | Kanıt |
| --- | --- |
| İlk shared miss, başka oturum shared hit, ikinci çağrı yok, benzersiz ID | hybrid + HTTP gösterimi |
| Farklı ifade/model/sağlayıcı, Türkçe/İngilizce kategoriler | hybrid + cache + üç sağlayıcılı HTTP |
| Kişisel/özel izolasyon, sahte scope/auth, belirsizlik fallback | hybrid + security + HTTP |
| Yanıt reddi, hassas yanıt, dosya/araç/sistem/bağlam enjeksiyonu, zehirleme | security + SDK metadata |
| Eski özel kayıt yükselmez, politika değişimi, TTL/LRU/bayt/kapsam kotaları | hybrid + cache |
| Soğuk ortak ve özel eşzamanlı istek izolasyonu, hata/timeout temizliği | security + cache + HTTP |
| Sıfır yeni kullanım/maliyet, bilinmeyen önlenen maliyet, çift sayım yok | cache + hybrid + metrics + Cost Engine |
| Oturum/çerez/proxy, sağlayıcı ayarları, frontend API | HTTP + frontend |

## 8. Git akışı

Başlangıç çalışma ağacı temizdi. Origin fetch edildi; yerel main yalnız fast-forward ile
`6d3d5e8` noktasına güncellendi. Değişiklikler `feature/hybrid-shared-l1-cache` dalında yapılır.
Main'e özellik merge edilmez; force push kullanılmaz. Son commit/push sonucu teslim raporunda verilir.

## 9. Bellek ve sınırlamalar

Varsayılan toplam 500 kayıt, ortak 250 / özel 250 kayıt, kayıt başına 256 KiB,
toplam serileştirilmiş 16 MiB ve 30 dakika TTL. Ayrı kotalar toplam sınırın içindedir.
TTL/LRU, defensive copy, delete/clear ve kapsam/politika invalidation korunur.
Bayt bütçesi V8 nesne ek yükünü tam ölçmez. Yeniden başlatmada cache, oturumlar ve API anahtarları silinir.
İstek kararları kayıt metadatasında ve yanıtta bulunur; kalıcı/genel audit akışı eklenmedi.
Analitikler mevcut arayüz oturumuyla sınırlıdır.

Yerleşik deterministik doğrulayıcı çalışır; gerçek ek LLM/semantik doğrulayıcı **yoktur**.
Ek doğrulayıcı için arayüz, güvenli çalıştırma ve kontrollü test fixture'ları vardır.
Genel bilgi istekleri sabit soru listesine bağlı değildir; yine de kategori ve özellikle yanıt biçimi
kapsamı dardır. Daha geniş kapsam için denetlenmiş yeni kurallar veya güvenilir ek doğrulayıcı gerekir.

## 10. Sonraki aşamaya hazırlık

ExactCacheStore, CacheInvalidation, AnswerRecord ve CacheDecision mantıksal sözleşmeleri depolamayı ayırır.
İleride PostgreSQL answer/provenance ve soru varyantlarını tutabilir; Redis kapsamlı hızlı lookup sağlayabilir.
L2 ayrı indeks ve uygunluk/kalite kurallarıyla answerId'ye referans verebilir. Şu an varyant eşleştirme,
embedding veya semantik arama yoktur. Cross-model reuse ayrı kalite/maliyet doğrulaması gerektirir;
bu L1 sürümünün ham sağlayıcı/model eşitliği gevşetilmemelidir.
