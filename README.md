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

## L1 Exact Cache

L1; **sunucuda onaylı tam istek birleşimlerini**, doğrulanmış tarayıcı oturumu ve tam sağlayıcı/model kimliği içinde tekrar kullanır.
Serbest sohbet çalışır; onaysız istekler normal sağlayıcı yolunda `bypass` olur. Anahtar kelime bulunmaması güvenlik kanıtı değildir.

Varsayılan örnekler (tam metin, sistem talimatı/geçmiş yok, varsayılan üretim parametreleri):

- `İkili arama algoritmasını açıkla.`
- `Pisagor teoremini açıkla.`
- `Explain the binary search algorithm.`

İlk uygun istek `miss/provider`, tamamlanmış yanıtın tekrarı `hit/l1_exact_cache`, devam eden aynı üretimin bekleyeni `inflight_shared` olur.
Benzer cümleler, farklı modeller ve farklı oturumlar paylaşılmaz.
Ayrı requestId'ler korunur; gerçek sağlayıcı tokenı/maliyeti yalnızca üretimi başlatan isteğe yazılır.

SHA-256 anahtarı; şema sürümü, tam mesaj, sistem talimatı, sıralı geçmiş, desteklenen üretim parametreleri,
sağlayıcı/model ve sunucudaki gizli olmayan cache bölümü + anahtar revizyonunu içerir.
API anahtarı ve çerez sırrı cache anahtarına girmez.
Tool/retrieval, streaming ve harici yan etki bu endpoint'te desteklenmez; açıkça istenirse 400 döner.

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
| L1_CACHE_MAX_ENTRY_BYTES | 262144 (256 KiB) | 2097152 |
| L1_CACHE_MAX_TOTAL_BYTES | 16777216 (16 MiB) | 268435456 |
| L1_CACHE_ENABLED | true | false ile kapatılır |
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
npm run test:integration
npm run test:frontend
npm run lint
npm run build
```

`npm test` üç test grubunu sırayla çalıştırır.
Testler mocked provider/HTTP yanıtları kullanır; ücretli API çağrısı yapmaz.
HTTP entegrasyonu gerçek yerel Express ve Vite proxy üzerinde çerez aktarımını da sınar.
Frontend testleri hesaplama, React server render ve fetch sözleşmesi testleridir; gerçek tarayıcı etkileşim testi değildir.

Ayrıntılı kararlar, maliyet anlamları, test kapsamı ve sınırlamalar: [L1 stabilizasyon raporu](docs/L1_CACHE_STABILIZATION_TR.md).
