# TokenAI — L1 stabilizasyon ve doğrulama raporu

## 1. Genel Özet

Başlangıçtaki çalışma ağacı temizdi. `main`, `origin/main` üzerindeki `f397326` commitine fast-forward edildi; çalışma `fix/l1-cache-stabilization` dalında yapıldı.

İncelemede istemci securityScope alanının güvenilir kimlik gibi kullanıldığı, API anahtarlarının tarayıcılar arasında ortak olduğu,
dinamik sözcük filtresinin diğer tüm metinleri uygun saydığı, eşzamanlı aynı sorunun iki üretim yaptığı ve kayıt boyutunun sınırsız olduğu görüldü.
Bu davranışlar düzeltildi. Yeni bağımlılık, veritabanı, tam login, L2, embedding veya semantik doğrulayıcı eklenmedi.

## 2. Değiştirilen Dosyalar

| Dosya | Amaç |
| --- | --- |
| server/app.ts | Test edilebilir Express fabrikası; origin/JSON/özel başlık kontrolleri; oturuma özel sağlayıcı anahtarları ve model listesi; kontrollü HTTP hataları |
| server/index.ts | Loopback üzerinde sunucu başlangıcı ve kapanış |
| server/security/sessions.ts | Rastgele HttpOnly oturumlar, gizli belirteçten ayrı cache bölümü, süre/kapasite sınırı |
| server/services/chat/requestValidation.ts | Çalışma zamanında dar istek sözleşmesi; prototip/ek alan/sayısal sınır kontrolleri |
| server/services/chat/chatService.ts | Uygunluk, key lookup, tek üretim paylaşımı, zaman aşımı, maliyet sahipliği ve kaynak metadata |
| server/services/cache/cachePolicy.ts | Sunucuda gözden geçirilmiş tam içerik birleşimleri; varsayılan kapalı uygunluk |
| server/services/cache/cacheKey.ts | Deterministik SHA-256 ve geçersiz kanonik değerlerin reddi |
| server/services/cache/cacheTypes.ts | Şema v2, güvenilir cache bölümü/revizyonu, kayıt kabulü ve invalidation sürümü |
| server/services/cache/exactCache.ts | TTL/LRU, kayıt/toplam bayt bütçesi, kopyalama, duplicate key ve invalidation |
| server/services/providers/openai.ts | AbortSignal, otomatik tekrarın kapatılması |
| server/services/providers/groq.ts | AbortSignal, otomatik tekrarın kapatılması |
| server/services/providers/gemini.ts | AbortSignal ve hassas hata metinlerinin loglanmaması |
| server/services/cost/costEngine.ts | NaN/sonsuz maliyet reddi; ayrı ücretlenen bilinmeyen düşünme tokenlarını sıfır saymama |
| server/types/api.ts, src/types/telemetry.ts | inflight_shared/cacheStatus/cacheWriteReason ve bilinmeyen altyapı maliyeti |
| src/utils/api.ts | Tek başlangıç oturumu, same-origin çerez ve POST koruma başlığı |
| src/utils/metrics.ts | Hit/miss/bypass/shared ayrımı, tam veri gerektiren tahmin toplamları, zaman aralığı sınırları |
| src/components/MainWorkspace.tsx | İstemci sessionId üretiminin kaldırılması, yeni telemetri ve oturum kaybında seçim temizliği |
| src/components/RequestAnalysis.tsx | Yanıt kaynağı, kaynak kullanım ve gerçek/önlenen tahmin ayrımı |
| src/components/MetricsPopover.tsx | Dört durumun ayrı sayımı ve bilinmeyen değerlerin doğru gösterimi |
| src/components/SettingsModal.tsx | Aynı oturumlu ve CSRF korumalı API erişimi |
| vite.config.ts | Sabit geliştirme portu ve açık IPv4 loopback proxy hedefi |
| server/services/cache/cache.test.ts | Cache/policy/key/concurrency/runtime doğrulama testleri |
| server/services/providers/providers.test.ts | Üç gerçek SDK'nın mock fetch ile istek/parametre/iptal/tekrar sözleşmeleri |
| server/services/cost/costEngine.test.ts | Mevcut fiyat testleri ve eksik/bozuk kullanım regresyonları |
| server/app.test.ts | Gerçek HTTP ve Vite proxy üzerinden oturum/anahtar/CSRF/hata testleri |
| tests/metrics.test.ts, tests/frontend.test.tsx | Gerçek servis telemetrisiyle analitik, render ve frontend fetch testleri |
| package.json | Ayrı birim, entegrasyon ve frontend test komutları |
| README.md, bu belge | Çalıştırma, güven sınırı, ortam ayarları, kısıtlar ve sonuçlar |

## 3. Yeni L1 Çalışma Akışı

Örnek uygun mesaj: `İkili arama algoritmasını açıkla.` Tam metin, boş geçmiş, sistem talimatı olmaması ve varsayılan parametreler birlikte onaylıdır.

1. Aynı oturum ilk kez bu mesajı gpt-4o ile yollar: `cacheStatus=miss`, `responseSource=provider`. Başarılı ve tam yanıt bütçeye sığıyorsa saklanır.
2. Aynı oturum aynı isteği yanıt tamamlandıktan sonra tekrarlar: `hit/l1_exact_cache`. Yeni sağlayıcı çağrısı yoktur.
3. İlk üretim hâlâ devam ederken birebir aynı istek gelir: `inflight_shared`. Bekleyen farklı requestId alır; hit sayılmaz.
4. `Bugün hava nasıl?` veya onay listesinde olmayan herhangi bir serbest metin gelir: `bypass/provider`. Sohbet normal çalışır.
5. Farklı oturum/model/sağlayıcı/anahtar revizyonu bağımsız anahtardır. Uygun istek için miss olur. Onaysız sistem/geçmiş/parametre birleşimi bypass olur.

Uygunluk ile eşleşme ayrıdır. SHA-256 eşitliği yalnızca **zaten uygun** isteklerin aynı girdi olduğunu belirler; metnin güvenli veya doğru olduğuna ilişkin semantik kanıt değildir.
Sunucu onay listesi tam içerik birleşiminin SHA-256 parmak izini içerir; istemciden `cacheSafe`, kategori veya özel onay hash'i kabul edilmez.
Yeni bir birleşim eklemek sunucu tarafında kod incelemesi gerektirir. Varsayılan liste üç statik eğitim sorusuyla sınırlıdır; hit oranı bilinçli olarak düşer.

### İstek sözleşmesi

`POST /api/chat`: `provider`, `model`, `message`; isteğe bağlı `systemInstructions`, `conversation`, `generationParameters`, `forceCacheBypass`.
`temperature` 0–2, `topP` 0–1, `maxOutputTokens` 1–32768 tam sayı, `seed` 0–2147483647 tam sayı, en fazla dört 200 karakterlik stop sequence kabul edilir.
Gemini `seed` uygulamadığından reddedilir. Modelin desteklemediği diğer geçerli parametreler sağlayıcıdan kontrollü hata dönebilir.
Mesaj en fazla 32000, sistem talimatı 16000 karakter; geçmiş en fazla 100 mesajdır. Toplam JSON 128 KiB sınırı ayrıca uygulanır.
Ek yanıt-etkileyen alanlar, bozuk nesneler, `__proto__`/constructor/prototype gibi alanlar, `stream=true`, side effect ve null olmayan tool/retrieval bağlamı 400 alır.
Harici bağlam fingerprint'i araç sonucunun kendisi değildir; sessizce yok saymak yerine destek dışı kabul edilir. Null tool/retrieval değerleri şemada korunur.
Eski `securityScope` nesnesi yalnızca sınırlı string alanlarıyla kabul edilip atılır; yetki veya cache uygunluğu kazandırmaz.

### Invalidation ve eşzamanlılık

`cache.clear()`/`delete()` sürümü değiştirir. Önceki sürümde başlayan üretim tamamlanınca eski kaydı geri yazamaz; yeni istek eski in-flight grubuna katılmaz.
API anahtarı yapılandırıldığında sunucudaki credentialRevision artar; başka hesabın önceki cache yanıtı veya in-flight üretimi kullanılmaz.
TTL, kapasite veya boyut yüzünden kayıt saklanamaması bir **miss** olmaya devam eder; `cacheWriteReason` nedeni belirtir. Bypass ile karıştırılmaz.

## 4. Güvenlik

Sunucu `crypto.randomBytes(32)` ile tahmin edilemez oturum belirteci oluşturur. Sunucu tablosu belirtecin SHA-256 özetini tutar;
cache kapsamına ise ayrı üretilmiş gizli olmayan UUID girer. Bilinmeyen/bozuk/çift cookie sunucu tarafından benimsenmez.
API anahtarları aynı session nesnesinde tutulur; çerezde, cache anahtarında ve yanıtta bulunmaz. Gemini model keşfinde API anahtarı URL yerine header ile gönderilir.
Ham provider hata mesajı istemciye/loglara taşınmaz. Session secret loglanmaz.

HttpOnly ve SameSite=Strict kullanılır; HTTPS ortamında Secure ve __Host- adı zorunlu tutulur. Domain verilmez, Path=/ olur.
Bu tercihler [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) davranışına dayanır.
Express proxy başlıklarına otomatik güvenmez; dış HTTPS origin açık yapılandırılır. Ayrıntı: [Express proxy güven sınırı](https://expressjs.com/en/guide/behind-proxies/).
Vite aynı-origin proxy ile çerezi aktarır. POST JSON ve özel başlık ister; Origin allowlist ve Sec-Fetch-Site kontrolü uygulanır. Açık CORS kaldırıldı.
Origin göndermeyen komut satırı istemcileri de özel başlık/JSON/çerez sözleşmesini izlemelidir; bu özel başlık bir kullanıcı kimliği değildir.

Tarayıcı oturum izolasyonu **tam kullanıcı kimlik doğrulaması veya tenant sistemi değildir**. Aynı profilin sekmeleri oturumu paylaşır.
Cookie kopyalanır/çalınırsa o oturuma erişilebilir; XSS ve ele geçirilmiş cihaz bu korumanın dışında kalır. Yönetim, login, yetki rolleri eklenmedi.

### Oturum yaşam döngüsü

- Cookie üzerinde Expires/Max-Age yoktur. Normal kapanışta silinir; tarayıcının session restore özelliği onu koruyabilir.
- Sunucuda mutlak varsayılan 8 saat vardır, her istekte uzamaz. Süresi dolduğunda yeni session oluşturulur; API anahtarı yeniden girilir.
- Session kayıtları periyodik (en fazla 60 saniye) ve erişimde temizlenir; kapasite doluyken yeni oturum 503 alır.
- Backend restart cache, session ve API anahtarlarını siler. Tarayıcı eski cookie taşısa bile yeni session gerekir.
- Erişilemez eski cache kayıtları TTL/LRU ile temizlenir; kalıcı disk kaydı yoktur.

## 5. Token ve Maliyet

| Yol | Yeni provider tokenı/maliyeti | Kaynak tokenı | Önlenen tahmin |
| --- | --- | --- | --- |
| Provider miss/bypass | Sağlayıcının raporladığı kullanım ve mevcut Cost Engine hesabı | Aynı üretim | null |
| Tamamlanmış L1 hit | 0 / 0 | Geçmiş üretimin kullanımı | Biliniyorsa kaynak kullanımı/fiyatı |
| In-flight paylaşımı | 0 / 0 | Üretimi başlatan isteğin kullanımı | Biliniyorsa kaynak kullanımı/fiyatı |

Üretimi başlatan istek maliyetin tek sahibidir. Bekleyenlerin `sourceRequestId` alanı bu isteğe bağlanır.
Her yanıt kendi requestId/timestamp/latency alanını korur. Kaynak tokenları gerçek toplam tüketim alanlarına eklenmez.
Altyapı maliyeti ölçülmediğinden `cacheInfrastructureCost=null` kalır.
Kaynak fiyat/kullanım bilinmiyorsa önlenen tahmin null'dur. Ayrı ücretlenen düşünme kullanımı eksikse toplam maliyet artık sıfır varsayımıyla tamamlanmaz.
Mevcut fiyat kayıtları değiştirilmedi veya yeniden fiyatlandırılmadı; fiyatların bugün güncel olduğu bu çalışma kapsamında bağımsız olarak doğrulanmadı.

Analitikte hit/miss/bypass/shared ayrı sayılır. Hit oranı `hit/(hit+miss)`; shared ve bypass paydada değildir.
Gerçek maliyet yalnızca sahipte sayılır. Gerçek maliyet panelinin kısmi bilinen toplamı kapsam uyarısıyla gösterilir.
Önlenen token/maliyet toplamında bir veri eksikse toplam null olur. Gerçek token toplamları da eksik veriyi sıfıra dönüştürmez.
Saat/gün/hafta/ay sırasıyla son 60 dakika/24 saat/7 gün/30 gündür. Gelecek tarihli kayıtlar dışlanır.
Bu değerler garanti tasarruf değildir: ücretsiz kota, kredi, indirim, cache altyapısı veya gerçekleşecek alternatif çıktı uzunluğunu kanıtlamaz.

## 6. Test Sonuçları

Doğrulama komutları: `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`.
Testler dış sağlayıcıya ücretli istek göndermez. Backend servis testleri mock provider; SDK testleri mock fetch; HTTP testleri yerel Express/Vite kullanır.
Son tam çalıştırmada **47/47 test geçti**: 29 backend birim/SDK test sonucu, 11 HTTP/proxy entegrasyon testi ve 7 frontend testi.
29 birim sonucu içinde yer alan Cost Engine dosyası ayrıca **50/50 assertion** çalıştırdı.
TypeScript typecheck, production build ve `git diff --check` başarılı oldu. Lint çıkış kodu 0; mevcut 20 uyarı var.
Build ayrıca performans zamanlaması uyarısı verdi; derleme başarısızlığı veya TypeScript hatası yoktu.

Kapsam: ilk miss/ikinci hit/çağrı sayısı; farklı provider/model/prompt/geçmiş/sistem/parametre; doğrulanmış oturum ve anahtar revizyonu;
sahte scope; bozuk/ek alan; onaysız/dinamik bypass; TTL/LRU/duplicate/byte bütçesi; eksik/başarısız provider yanıtı;
aynı ve farklı oturumlarda concurrency; toplu hata temizliği; timeout ve geç sonuç; ayrı requestId ve tek maliyet sahipliği;
bilinmeyen fiyat/kullanım; semantik eşleşmeme; cache disable; frontend toplamları; cookie süresi/restart/fixation/Secure/CSRF;
Vite cookie aktarımı; OpenAI/Gemini/Groq SDK parametre ve AbortSignal uyumluluğu.

Frontend render testleri Markdown başlık/kod/liste/tablo/link, RequestAnalysis, MetricsPopover ve SettingsModal/ThemeProvider bileşimlerini çalıştırır.
Gerçek tarayıcıda tıklama, tema geçiş animasyonu, görsel yerleşim ve gerçek HTTPS TLS sonlandırma uçtan uca denenmedi.
Üç canlı sağlayıcıya gerçek anahtarla çağrı yapılmadı; güncel model erişimi sağlayıcıya bağlıdır.
Lint mevcut MarkdownRenderer, ThemeContext ve ChatInput uyarılarını bildirir; bu kapsam dışında kalan dosyalar değiştirilmedi.

## 7. GitHub Durumu

Çalışma dalı `fix/l1-cache-stabilization`. Doğrulama sonrasında commit ve normal push yapılır; main'e otomatik merge/force push yapılmaz.
Kesin commit SHA ve uzak dal doğrulaması teslim mesajında raporlanır.

## 8. Kalan Riskler

- Statik allowlist yalnızca gözden geçirilmiş dar istekleri kapsar. Yeni kuralların güvenliği insan incelemesine bağlıdır; semantik anlam/cevap doğruluğu doğrulanmaz.
- Model alias'ı aynı kalıp sağlayıcı modeli güncellerse TTL boyunca önceki yanıt kullanılabilir. Pinned model ID ve kısa TTL tercih edilebilir.
- Cache bütçesi JSON UTF-8 baytlarını sınırlar; V8 nesne ek yükü, SDK cevabının parse sırasında tuttuğu bellek ve toplam süreç RSS'ini ölçmez.
- 100 aktif üretim/anahtar başına 32 bekleyen varsayılanıyla registry sınırlıdır. Provider timeout 60 saniye, SDK'lara AbortSignal iletilir; başarısızlıkta registry temizlenir.
- Tarayıcının bağlantıyı kapatması ortak üretimi iptal etmez. Diğer bekleyenler yanıt alabilir; en geç sunucu timeout'u uygulanır.
- Sağlayıcı uzakta iptali geç uygulayabilir veya ücret yazmış olabilir. Timeout/transport hatasında kullanım bilinmez; hata yanıtı requestId taşır, başarılı analytics kaydı oluşturmaz.
  Dolayısıyla arayüz sağlayıcı faturasının kesin toplamı değildir. Sonraki retry ayrı ve potansiyel ücretli üretimdir.
- Mevcut adaptörlerin iptal sözleşmesi mock fetch ile test edildi. İptali görmezden gelen gelecekteki bir adaptör dış kaynak tüketebilir;
  Promise.race HTTP/registry bekleyişini sınırlar ama yabancı SDK'nın iç kaynaklarını zorla temizleyemez.
- In-memory cache/session tek süreç içindir. Çoklu instance, merkezi oturum, kalıcı analitik, per-IP rate limit ve kapsamlı DoS koruması yoktur.
- Oturum tablosu dolduğunda yeni oturumlar 503 alır. Mevcut kullanıcı oturumlarını kapasite için sessizce düşürmek yerine bu davranış tercih edildi.
- Arayüz mevcut davranışı gereği yalnızca yeni mesajı gönderir; çok turlu konuşma geçmişi API'de desteklense de UI'de bu görev kapsamında yeniden tasarlanmadı.
- Mevcut model menüleri ve Gemini filtreleri korundu; model yaşam döngüsü/güncel fiyat incelemesi ayrı iştir.

## 9. Sonraki Aşamaya Hazırlık

L1 için uygunluk, güven sınırı, exact key, kaynak metadata, maliyet sahipliği ve depo arayüzü artık açık ve testlenebilir.
Bu temel L2 **mimari tasarımını** tartışmaya uygundur. L2 uygulaması, model-arası paylaşım, semantik uygunluk veya production readiness bu sonuçlardan çıkarılamaz.
Önce gerçek tarayıcı/HTTPS doğrulaması, kontrollü sağlayıcı entegrasyonu ve hedef dağıtımın kimlik/limit gereksinimleri planlanmalıdır.
