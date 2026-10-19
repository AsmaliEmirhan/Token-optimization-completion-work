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

## Gizlilik öncelikli ortak L1 Exact Cache

TokenAI, mevcut sürümde yalnız iki aşamada doğrulanmış `public_shareable` istekleri ortak L1'de saklar. Önce istek, sağlayıcı yanıtından sonra yanıt sınıflandırılır. İstek veya yanıt `user_private`, `session_private`, `sensitive`, `dynamic` ya da `uncertain` ise normal model yanıtı üretilir ve hiçbir cache kaydı yazılmaz. Özel cache kapsamı geçmiş mimariyle uyumluluk için tiplerde kalır; uygulama özel kayıt okumaz veya yazmaz.

Yapısal kontroller sohbet geçmişini, sistem talimatını, doğrulanmış kimliği, harici bağlamı ve belirgin hassas/dinamik içerikleri denetler. Anahtar sözcüğün bulunmaması kamusal paylaşım kanıtı sayılmaz. Herhangi bir ülke, şehir, soru veya cevap şablonu üretim politikasında onay listesi olarak kullanılmaz. Semantik olarak belirsiz içerik için varsayılan karar `uncertain` ve Bypass'tır.

Güvenilir bir semantik sınıflandırıcı sunucuya ayrıca bağlanabilir. Bunun için `AppOptions.cacheClassifier` ve açık `classifierConsent: true` birlikte verilmelidir. Sınıflandırıcı yalnız modelin göreceği isteği/yanıtı alır; kullanıcı sağlayıcısının API anahtarına, çereze veya doğrulanmış oturum bölümüne erişmez. Sonuç; gizlilik sınıfı, güven değeri, sürüm, sabit neden kodu, token kullanımı ve tahmini maliyet içerir. Eksik/bozuk sonuç, düşük kamusal güven, hata veya zaman aşımı paylaşım izni vermez. Hazır uygulamada gerçek semantik sınıflandırıcı ve ek ücretli çağrı yoktur; testlerde yalnız mock kullanılır. Böylece varsayılan kurulumda Shared Hit beklenmez.

Onaylı ortak adayın anahtarı SHA-256 ile ham sağlayıcı, tam model, ham soru, sistem/geçmiş izleri, üretim ayarları, kapsam, şema ve politika/sınıflandırıcı sürümünden üretilir. İlk üretimden sonra güvenlik metadatası ve yanıt içeriği yeniden denetlenir. Onaylı kayıt TTL, LRU ve boyut sınırlarıyla tutulur. Ayrı oturumların doğrulanmamış eşzamanlı üretimleri birbirine bağlanmaz. Eski politika sürümündeki ortak kayıtlar, eski özel kayıtlar ve uyumsuz anahtarlar okunmaz.

Arayüz ilk turda boş, sonraki turlarda tam sohbet geçmişini gönderir. Yerel hata bildirimleri ve arayüz metadatası modele gitmez. Aynı anda ikinci gönderim engellenir. Sunucu geçmişi sessizce kırpmaz; istek sınırı aşılırsa hata verir. Sohbet geçmişi ve kimlik bağlamı mevcut politikada cache dışıdır.

İstek Analizi gizlilik sınıfını, cache kararını, gerçek sağlayıcı tokenlarını, sınıflandırıcı ek yükünü ve toplam işlem maliyetini ayrı gösterir. Kullanım Analizi maliyet toplamına sınıflandırıcı giderini bir kez ekler. Provider çağrısı önlenmiş olsa bile her cache hit'inde istek sınıflandırması tekrar ücretlendirilir; net token/maliyet tahmini bu ek yükü düşer ve negatif olabilir. Eksik fiyat veya sınıflandırma ölçümü sıfır varsayılmaz. Analitik kaydına soru veya yanıt metni kopyalanmaz.

Güncel kurtarma ve doğrulama ayrıntıları: [Genel cache gizlilik politikası](docs/CACHE_POLICY_GENERALIZATION_TR.md).
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
| CACHE_CLASSIFIER_TIMEOUT_MS | 1000 (eski `CACHE_VALIDATOR_TIMEOUT_MS` yedek değerdir) | 30000 |
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

Önceki hibrit mimari kaydı: [Hibrit ortak L1 raporu](docs/HYBRID_SHARED_L1_TR.md).
Önceki sürümün tarihsel kaydı: [L1 stabilizasyon raporu](docs/L1_CACHE_STABILIZATION_TR.md).
