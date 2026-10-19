# TokenAI — Güvenli kurtarma ve genel cache gizlilik politikası

## Kurtarma kaydı

`origin/main` doğrulandı: `75c9e7a68f30f6776b53dc4e6056eabd96bc57c9`. Yarım kalan `fix/l1-final-stabilization` çalışma ağacında 11 izlenen dosya değişikliği ve iki izlenmeyen dosya vardı; sahnelenmiş değişiklik veya uzakta olmayan yerel commit yoktu. Bunların tamamı `backup/interrupted-l1-20261019` dalındaki `481821b699243ba23f0cbbe42776c7e52f925065` commit'ine alındı. Yedek ağacında iki yeni dosya ve 13 değişen dosya doğrulandı; yedek dal silinmedi veya uzak depoya gönderilmedi.

`fix/cache-policy-generalization`, temiz `origin/main` tabanından açıldı. Yarım kalan çalışmanın ülke/başkent veri tablosu, olgusal yanıt şablonları ve özel cache genişletmesi bu dala alınmadı. Ana daldaki mevcut soru/yanıt şablonları da yeni uygulamada kaldırıldı. Mevcut L1 anahtarlama, TTL/LRU, oturum sınırı, sağlayıcılar, maliyet ve arayüz bileşenleri korunarak gizlilik politikası değiştirildi.

## Karar sözleşmesi

| Sınıf | Bu sürümde davranış |
| --- | --- |
| `public_shareable` | Açıkça etkinleştirilmiş güvenilir sınıflandırıcı hem isteği hem yanıtı onaylarsa ortak L1. |
| `user_private` | Normal sağlayıcı yanıtı; cache okuma/yazma yok. |
| `session_private` | Normal sağlayıcı yanıtı; cache okuma/yazma yok. |
| `sensitive` | Normal sağlayıcı yanıtı; cache okuma/yazma yok. |
| `dynamic` | Doğrulanmış tazelik politikası bulunmadığından cache yok. |
| `uncertain` | Normal sağlayıcı yanıtı; cache okuma/yazma yok. |

Yapısal ilk katman geçmiş, sistem talimatı, auth kimliği, harici bağlam ve belirgin risk işaretlerini inceler. HTTP bugün dosya, retrieval, araç ve yan etkili çağrıları desteklemediği için bunları istek doğrulamasında reddeder; boş bağlam gibi davranıp cache'e sokmaz. Olumlu kamusal karar anahtar sözcük yokluğundan, ülke listesinden veya cevap şablonundan türetilmez. Regex risk işaretleri tüm kişisel/dinamik anlamları yakalayabildiği iddiası taşımaz. Bunların dışında sınıflandırıcı yoksa karar `uncertain` olur.

`SemanticPrivacyClassifier` iki ayrı sunucu çağrısı sözleşmesi sunar: `classifyRequest` ve `classifyResponse`. Her sonuç sınıf, güven, sürüm, sabit neden kodu, token ve maliyet ölçümü taşır. `public_shareable` için güven en az `0.95` olmalıdır; bu eşik bir doğruluk garantisi değildir. Güvenilir sonuç biçimi bozuksa, ölçüm yoksa, hata veya zaman aşımı oluşursa paylaşım reddedilir. Sağlayıcının tamamlanma/araç/retrieval/özel bağlam metadatası ve yanıtın belirgin riskleri ayrıca denetlenir. Sınıflandırıcının serbest neden metni telemetriye aktarılmaz.

Sınıflandırıcı yalnız `cacheClassifier` ve `classifierConsent: true` birlikte sunucu yapılandırmasına verildiğinde çalışır. Kullanıcının üretim API anahtarı veya çerezi bu arayüze verilmez. Gerçek semantik sınıflandırıcı bağlanmadı; hazır kurulumda ücretli ek çağrı yapılmaz ve genel sorular Shared Hit alamaz. Testlerde kullanılan sınıflandırıcı yalnız sentetik fixture'dır; keyfi soruların güvenle kamusal sınıflandırılabildiğini kanıtlamaz. Gelecekteki ücretli uygulamada operatör açık rıza ve ayrılmış kimlik bilgileri sağlamak, maliyeti doğrulamak zorundadır.

## L1 ve maliyet

Kamusal onaydan sonra anahtar; ham soru, tam sağlayıcı/model, sistem/geçmiş izi, üretim ayarları ve sürümleri içerir. Eski `hybrid-rules-v1` kayıtları yeni sürümde okunmaz. Başlangıçta uyumsuz ortak ve tüm eski özel kayıtlar silinir; depo yeni özel kaydı reddeder. TTL, LRU, kapasite, sağlayıcı atfı ve oturumlar arası doğrulanmamış eşzamanlı paylaşım yasağı korunur. Aynı oturumdaki özdeş kamusal adaylar sağlayıcı üretimini geçici olarak paylaşabilir; bu kalıcı cache yazımı değildir.

Sağlayıcı token/maliyeti ile sınıflandırıcı token/maliyeti ayrı alanlarda tutulur. `pipelineTotalCost`, biliniyorsa bu iki maliyetin toplamıdır; eksik ölçüm sıfır sayılmaz. Hit sırasında sağlayıcıya yeni üretim gitmez, fakat istek sınıflandırması yeniden çalışır. Bu nedenle brüt önlenen sağlayıcı kullanımı ve sınıflandırma sonrası net tahmin ayrı tutulur; net değer negatif olabilir. Kullanım Analizi toplam işlem maliyetini bir kez sayar. Analitik kaydında soru/yanıt metni yerine sabit bir yer tutucu kullanılır.

## Doğrulama ve sınırlar

`npm run typecheck`, `npm run test:unit`, `npm run test:security`, `npm run test:integration`, `npm run test:frontend`, `npm run lint` ve `npm run build` uygulanır. HTTP testleri ayrı çerezli A→B akışını, özel sorularda sıfır cache yazımını, hassas yanıtta paylaşım reddini, sağlayıcı/model/ifade ayrımını ve sınıflandırma ek yükünü mock ile doğrular. Gerçek sağlayıcıya veya ücretli sınıflandırıcıya test çağrısı yapılmaz.

Bu mimari gerçek semantik sınıflandırıcıyı hazır olarak sağlamaz. Yapısal risk kuralları yalnız bilinen işaretleri yakalar; bağlanacak sınıflandırıcının güvenilirliği ayrıca değerlendirilmeli ve yanlış kamusal onayın etkisi ölçülmelidir. Sınıflandırıcı maliyet tahmini de uygulayıcı tarafından doğru raporlanmalıdır. Auth, kalıcı veritabanı, retrieval, araç, dosya desteği ve L2 bu kapsamda yoktur.
