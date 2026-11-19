# BERTurk L1 Sınıflandırıcı Raporu — `berturk-l1-20261118-1533`

- Temel model: `dbmdz/bert-base-turkish-cased`
- Eğitim tarihi: 2026-11-18 15:32:42
- En iyi doğrulama macro-F1: **0.992**
- Sıcaklık (temperature): 1.214
- Seçilen eşik **τ = 0.5** (doğrulamada hedef genel-precision ≥ 0.98)


## 1. Önbellek kararı (asıl önemli olan)

| Set | Önbelleğe alınan | Genel precision | Genel coverage | Kritik hata (genel olmayan önbelleğe girdi) |
|---|---|---|---|---|
| Doğrulama | 179 | 0.994 | 1.000 | 1 |
| **Test (insan yazımı)** | 91 | **0.923** | 0.857 | **7** |

## 2. Dört sınıflı başarı (test)

- Doğruluk (accuracy): 0.872
- Macro-F1: 0.876

| Sınıf | Precision | Recall | F1 | Örnek |
|---|---|---|---|---|
| genel | 0.923 | 0.857 | 0.889 | 98 |
| kisisel | 0.939 | 0.821 | 0.876 | 56 |
| degisken | 0.757 | 0.903 | 0.824 | 62 |
| sanatsal | 0.889 | 0.941 | 0.914 | 34 |

### Karışıklık matrisi (satır = gerçek, sütun = tahmin)

|  | genel | kisisel | degisken | sanatsal |
|---|---|---|---|---|
| genel | 84 | 1 | 11 | 2 |
| kisisel | 2 | 46 | 6 | 2 |
| degisken | 5 | 1 | 56 | 0 |
| sanatsal | 0 | 1 | 1 | 32 |

## 3. Kritik hatalar — önbelleğe girecek olan genel-olmayan sorular

| id | Soru | Gerçek | p(genel) |
|---|---|---|---|
| h-0017 | Takip eden paragrafı tamamla: İklim değişikliği, özellikle fosil yakıt tüketimi (kömür, petrol ve doğalgaz gibi) ve ormansızlaşma gibi | degisken | 0.741 |
| h-0119 | Göz damlası ne kadar sürede etki eder | degisken | 0.997 |
| h-0145 | Cips çeşitleri nelerdir | degisken | 0.998 |
| h-0153 | Vietnamda yaşanır mı ? | kisisel | 0.984 |
| h-0170 | Sistem gereksinmlerini karşılar mı | kisisel | 0.701 |
| h-0187 | İsmail isminde ünlüler ? | degisken | 0.880 |
| h-0193 | PS5 4K da kaç fps verir ? | degisken | 0.994 |

## 4. Kaçırılan genel sorular (önbellek fırsatı kaybı)

| id | Soru | Tahmin | p(genel) |
|---|---|---|---|
| h-0001 | Üniversite internetten kayıt yaptıktan sonra okula gitmeye gerek var mı? | degisken | 0.001 |
| h-0087 | Hyundai i20 sedan mı | degisken | 0.001 |
| h-0126 | Yerel seçimlerde kimler oy kullanmaz | degisken | 0.021 |
| h-0133 | kombin öner | sanatsal | 0.015 |
| h-0157 | Gta5 sistem gereksinimleri | degisken | 0.002 |
| h-0161 | İlk sınav ne zaman yapılmıştır | degisken | 0.017 |
| h-0192 | Ps5 de oynanabilecek oyunlar ? | degisken | 0.003 |
| h-0200 | Müzik bir sanat mıdır | degisken | 0.023 |
| h-0206 | Saçımı nasıl güzelleştiririm | kisisel | 0.002 |
| h-0215 | Emel sayın sağ mı | degisken | 0.002 |
| h-0217 | Dünyanın kaç uydusu var ? | degisken | 0.116 |
| h-0218 | Bana türk şiir tarihini anlat | sanatsal | 0.275 |
| h-0240 | insanlığın işlenmiş en büyük 10 suçu | degisken | 0.030 |
| h-0246 | makale konuları neler olabilir | degisken | 0.002 |

## 5. Tüm yanlış sınıflandırmalar

| id | Soru | Gerçek | Tahmin | Güven |
|---|---|---|---|---|
| h-0001 | Üniversite internetten kayıt yaptıktan sonra okula gitmeye gerek var mı? | genel | degisken | 0.992 |
| h-0017 | Takip eden paragrafı tamamla: İklim değişikliği, özellikle fosil yakıt tüketimi (kömür, petrol ve doğalgaz gibi) ve ormansızlaşma gibi | degisken | genel | 0.741 |
| h-0087 | Hyundai i20 sedan mı | genel | degisken | 0.998 |
| h-0102 | Yol içeren şarkılar nelerdir | sanatsal | degisken | 0.996 |
| h-0111 | Paramı dolara yatırsam şuan ne kadar dolarım olur | degisken | kisisel | 0.998 |
| h-0114 | bana bir para birimi oluştur | kisisel | degisken | 0.997 |
| h-0117 | Kokoreç neden bu kadar pahalı | kisisel | degisken | 0.998 |
| h-0119 | Göz damlası ne kadar sürede etki eder | degisken | genel | 0.997 |
| h-0126 | Yerel seçimlerde kimler oy kullanmaz | genel | degisken | 0.977 |
| h-0127 | Bebeğim için nini oluştur | sanatsal | kisisel | 0.991 |
| h-0133 | kombin öner | genel | sanatsal | 0.545 |
| h-0134 | bana bir halk oyunu söyle | kisisel | degisken | 0.852 |
| h-0138 | Bana bi atasözü söylesen ne söylerdin ? | kisisel | sanatsal | 0.854 |
| h-0145 | Cips çeşitleri nelerdir | degisken | genel | 0.998 |
| h-0153 | Vietnamda yaşanır mı ? | kisisel | genel | 0.984 |
| h-0157 | Gta5 sistem gereksinimleri | genel | degisken | 0.997 |
| h-0161 | İlk sınav ne zaman yapılmıştır | genel | degisken | 0.982 |
| h-0170 | Sistem gereksinmlerini karşılar mı | kisisel | genel | 0.701 |
| h-0182 | Şunlara göre tatil planı oluştur | kisisel | degisken | 0.940 |
| h-0187 | İsmail isminde ünlüler ? | degisken | genel | 0.880 |
| h-0192 | Ps5 de oynanabilecek oyunlar ? | genel | degisken | 0.996 |
| h-0193 | PS5 4K da kaç fps verir ? | degisken | genel | 0.994 |
| h-0199 | Müzik sanat için midir Müzik toplum için midir ? | kisisel | degisken | 0.994 |
| h-0200 | Müzik bir sanat mıdır | genel | degisken | 0.973 |
| h-0206 | Saçımı nasıl güzelleştiririm | genel | kisisel | 0.996 |
| h-0211 | Gümüş yatırımı yapmak mantıklı mı ? | kisisel | degisken | 0.996 |
| h-0215 | Emel sayın sağ mı | genel | degisken | 0.995 |
| h-0217 | Dünyanın kaç uydusu var ? | genel | degisken | 0.881 |
| h-0218 | Bana türk şiir tarihini anlat | genel | sanatsal | 0.684 |
| h-0240 | insanlığın işlenmiş en büyük 10 suçu | genel | degisken | 0.965 |
| h-0246 | makale konuları neler olabilir | genel | degisken | 0.996 |
| h-0249 | Benim için makale yaz | kisisel | sanatsal | 0.995 |

## 6. Eğitim geçmişi

| Epoch | Eğitim kaybı | Doğr. macro-F1 | Doğr. acc | Süre (sn) |
|---|---|---|---|---|
| 1 | 0.6007 | 0.981 | 0.980 | 448.8 |
| 2 | 0.0760 | 0.981 | 0.980 | 486.9 |
| 3 | 0.0117 | 0.983 | 0.982 | 452.6 |
| 4 | 0.0043 | 0.992 | 0.992 | 514.8 |
