# TokenAI

TokenAI; LLM token kullanımını, tahmini API maliyetini ve gecikmeyi izleyen React/Vite + Express üniversite projesidir.

## Çalıştırma

```bash
npm ci
npm run dev
```

Arayüz: http://localhost:5173. Backend yalnızca 127.0.0.1:3001 adresinde dinler.
5173 doluysa Vite başka porta geçmez. Böylece origin kontrolü ile geliştirme proxy'si aynı yapılandırmayı kullanır.
Windows PowerShell yürütme politikası npm.ps1'i engelliyorsa aynı komutları `npm.cmd` ile çalıştırın.

API anahtarını Ayarlar > API bölümünden mevcut tarayıcı oturumu için girin.
Anahtar sunucunun süreç belleğinde, yalnızca o oturumda tutulur. Yeniden başlatma veya oturum kaybı sonrası yeniden girilmesi gerekir.

## Hibrit doğrulamalı ortak L1 Exact Cache

L1; aynı ham soruyu, aynı sağlayıcı/model ve üretim bağlamında tekrar kullanır.
Üç soruluk sabit onay listesi kaldırıldı. Sunucu önce istek şemasını ve doğrulanmış oturumu,
sonra deterministik risk kurallarını ve olumlu statik kategori kanıtını değerlendirir.

- **Ortak**: bağlamsız coğrafya, matematik ve programlama dilbilgisi kurallarıyla ortak aday olur.
  Üretilen yanıt da ayrıca güvenlik metadatası ve tam içerik biçimi üzerinden doğrulanır.
- **Oturuma özel**: kişisel, sohbet/sistem talimatlı, özel parametreli veya paylaşımı belirsiz istekler
  yalnız sunucunun doğruladığı oturum ve anahtar revizyonunda tekrar kullanılır.
- **Kullanıcıya özel**: yalnız gelecekteki gerçek sunucu auth bağlamı için sözleşme hazırdır.
  Mevcut anonim HTTP uygulaması bu kapsamı üretmez.
- **Bypass**: dinamik/hassas veya güvenli olmayan istekler önbelleğe girmez.
  Desteklenmeyen araç, dosya, retrieval ve yan etki alanları HTTP katmanında reddedilir.

Örneğin “Türkiye'nin başkenti” ilk istekte Miss olur. Sağlayıcı “Türkiye'nin başkenti Ankara'dır.”
biçiminde doğrulanabilen bir yanıt döndürürse başka bir doğrulanmış oturumun **aynı tam sorusu** Shared Hit alır.
Uzun/serbest açıklama doğrulanamıyorsa özel saklanır; her genel bilgi cevabının ortak saklanacağı vaat edilmez.

**Gerçek bir LLM/semantik ek doğrulayıcı kurulmadı.** Sunucuya bağlanabilen iki aşamalı doğrulayıcı arayüzü,
yapılandırılmış sonuç denetimi, sürüm ve zaman aşımı uygulanmıştır. Varsayılan kurallar semantik anlayış değildir.
Belirsizlik ortak paylaşım izni vermez; ek ücretli model çağrısı yapılmaz.

SHA-256 anahtarında kapsam, doğrulanmış özel kapsam izi, ham sağlayıcı/model, tam mesaj,
sistem/geçmiş izleri, üretim parametreleri ve şema/politika/doğrulayıcı sürümü bulunur.
Ortak anahtarda kullanıcı veya oturum kimliği yoktur. API anahtarları/çerez sırları kayıtlara alınmaz.
Özel kayıtlar ortak kayda otomatik yükseltilmez. Politika sürümü değişince eski ortak kayıtlar geçersizleşir.

Yanıt kaynakları: provider, shared_l1_cache, private_l1_cache, inflight_shared.
Eski l1_exact_cache telemetrisi arayüzde okunabilir. Ortak kayıt araması yalnız istek onayından sonra yapılır;
ortak miss ardından izinli özel kapsam aranır. Cache hit yeni sağlayıcı tokenı ve API maliyeti üretmez.
Kaynak üretimin kullanımı ayrı tutulur; bilinmeyen önlenen maliyet null kalır.

**Oturumlar arası in-flight paylaşım kapalıdır:** henüz doğrulanmamış çıktı başka kullanıcıya verilemez.
Aynı özel kapsamdaki eşzamanlı istekler tek üretimi paylaşır. Her HTTP isteğinin ayrı requestId'si vardır;
gerçek kullanım/maliyet yalnız üretimi başlatan istekte sayılır. İki farklı oturumdaki eşzamanlı soğuk miss
iki sağlayıcı çağrısı yapabilir; tamamlanmış doğrulanmış kayıt sonraki isteklerde ortak kullanılır.

İstek Analizi ve saatlik/günlük/haftalık/aylık Kullanım Analizi ortak/özel hit, miss, bypass,
L1 hit oranı, gerçek kullanımın tahmini API maliyeti ve tahmini önlenen kullanımı ayrı gösterir.
Analitikler mevcut arayüz oturumuyla sınırlıdır; tahminler garantili fatura tasarrufu değildir.

## Güvenlik ve oturum

Sunucu 32 rastgele baytlık HttpOnly/SameSite=Strict çerezi oluşturur.
HTTPS dış origin yapılandırıldığında Secure ve __Host- çerez adı kullanılır.
Çerezde kullanıcı, API anahtarı veya cache verisi yoktur. Sunucu yalnızca kayıtlı rastgele belirteçleri kabul eder.
İstemcinin eski securityScope alanı kimlik kanıtı sayılmaz.

Bu mekanizma **tarayıcı oturumu izolasyonudur, kullanıcı kimlik doğrulaması değildir**.
Aynı tarayıcı profilindeki sekmeler aynı oturumu paylaşır.
Tarayıcı kapatıldığında session cookie normalde silinir; oturum geri yükleme özelliği çerezi koruyabilir.
Sunucu mutlak 8 saat sonra oturumu geçersizleştirir. Sunucu yeniden başlatılırsa oturumlar, anahtarlar ve cache kaybolur.

API aynı-origin proxy üzerinden kullanılır; açık CORS yoktur.
POST için JSON ve `X-TokenAI-Request: 1` gerekir; yabancı Origin ve cross-site Fetch Metadata reddedilir.
Üretim modunda `APP_ORIGIN=https://uygulama.example` zorunludur.
HTTPS reverse proxy'yi ayrıca kurun; X-Forwarded başlıkları koşulsuz güvenilir kabul edilmez.

## Yapılandırma

| Ortam değişkeni | Varsayılan | Üst sınır |
| --- | ---: | ---: |
| L1_CACHE_TTL_MS | 1800000 (30 dk) | 86400000 |
| L1_CACHE_MAX_ENTRIES | 500 | 100000 |
| L1_CACHE_MAX_SHARED_ENTRIES | 250 | 100000 |
| L1_CACHE_MAX_PRIVATE_ENTRIES | 250 | 100000 |
| L1_CACHE_MAX_ENTRY_BYTES | 262144 (256 KiB) | 2097152 |
| L1_CACHE_MAX_TOTAL_BYTES | 16777216 (16 MiB) | 268435456 |
| L1_CACHE_ENABLED | true | false ile kapatılır |
| CACHE_VALIDATOR_TIMEOUT_MS | 1000 | 30000 |
| PROVIDER_TIMEOUT_MS | 60000 | 300000 |
| L1_MAX_CONCURRENT_GENERATIONS | 100 | 1000 |
| L1_MAX_WAITERS_PER_KEY | 32 | 1000 |
| SESSION_TTL_MS | 28800000 (8 saat) | 86400000 |
| SESSION_MAX_ENTRIES | 1000 | 10000 |

Geçersiz sayısal yapılandırma başlangıçta hata verir. Bellek bütçesi serileştirilmiş UTF-8 kayıtları ölçer; toplam V8 heap/RSS ölçümü değildir.
TTL erişimde/yazmada temizlenir, kapasite ve bayt bütçesi LRU ile korunur. Oturumlar ayrıca periyodik temizlenir.
256 KiB sınırını aşan yanıtlar saklanmadan döner; 2 MiB üzeri sağlayıcı cevapları kontrollü hata verir.
İstek JSON sınırı 128 KiB'dir.

## Doğrulama

```bash
npm run typecheck
npm run test:unit
npm run test:security
npm run test:integration
npm run test:frontend
npm run lint
npm run build
```

`npm test` dört test grubunu sırayla çalıştırır.
Testler mocked provider/HTTP yanıtları kullanır; ücretli API çağrısı yapmaz.
HTTP entegrasyonu gerçek yerel Express ve Vite proxy üzerinde çerez aktarımını da sınar.
Frontend testleri hesaplama, React server render ve fetch sözleşmesi testleridir; gerçek tarayıcı etkileşim testi değildir.

Güncel mimari, test matrisi ve sınırlar: [Hibrit ortak L1 raporu](docs/HYBRID_SHARED_L1_TR.md).
Önceki sürümün tarihsel kaydı: [L1 stabilizasyon raporu](docs/L1_CACHE_STABILIZATION_TR.md).
