# TokenAI L1 — Soru Etiketleme Kılavuzu (v1)

Bu kılavuz, BERTurk sınıflandırıcısını eğitmek için kullanılan verinin **nasıl etiketleneceğini** tanımlar.
Her soru tam olarak **bir** etiket alır:

| Etiket (dosyadaki değer) | Anlamı | L1 kararı |
|---|---|---|
| `genel` | Yanıtı herkes için aynı, sabit ve tekrar kullanılabilir | Önbelleğe alınabilir |
| `kisisel` | Yanıt belirli bir kullanıcıya, onun verisine veya geçmişine bağlı | Önbelleğe alınmaz |
| `degisken` | Yanıt zamana, canlı veriye, rastlantıya veya sisteme bağlı | Önbelleğe alınmaz |
| `sanatsal` | Özgün yaratıcı içerik üretilmesi isteniyor | Önbelleğe alınmaz |

> Altın kural: **Emin değilsen `genel` verme.** Yanlış "genel" etiketi, bir kullanıcının kişisel yanıtının başka kullanıcılara gösterilmesine yol açabilir. Kaçırılan bir önbellek fırsatı ise sadece biraz maliyettir.

---

## 1. Öncelik sırası

Bir soru birden fazla kategoriye uyuyorsa yukarıdaki kazanır:

1. **kisisel** — kullanıcıya özgü bir bağımlılık var mı?
2. **degisken** — doğru yanıt zamana / canlı veriye / rastlantıya / seçili modele bağlı mı?
3. **sanatsal** — özgün yaratıcı bir eser mi isteniyor?
4. **genel** — yukarıdakilerin hiçbiri değilse.

Örnek: *"Bulunduğum yerde şu an hava nasıl?"* hem kişisel (konum) hem değişken (şu an) → **kisisel**.
Örnek: *"Bugünkü haberlere göre bir şiir yaz."* hem değişken hem sanatsal → **degisken**.

---

## 2. Kategori tanımları

### 2.1 `kisisel`
Doğru yanıt şunlardan birine bağlıysa:
- Kullanıcının kimliği, adı, konumu, sağlığı, parası, ilişkileri, cihazı, hesabı
- Kullanıcının **kendi materyali**: yüklediği dosya, CV, kod, e-posta, rapor, fotoğraf, tahlil, kendi yazdığı metin
- Konuşma geçmişi: "geçen sefer", "az önce söylediğim", "hatırlıyor musun", "bana önerdiğin"
- Kullanıcının kendi durumuna göre kişiselleştirilmiş tavsiye ("boyum 1.75, kilom 90, bana program yap")

Örnekler: *Benim adım ne?* · *Yüklediğim CV'mi incele.* · *Geçen konuşmamızdaki önerini hatırlat.* · *Maaşım 45 bin, nasıl bütçe yapmalıyım?*

### 2.2 `degisken`
Doğru yanıt aynı soru için zamanla veya her çağrıda değişiyorsa:
- Güncel/canlı veri: fiyat, kur, hava durumu, trafik, maç skoru, haber, gündem, stok, sefer durumu
- Tarih/saate bağlı: "bugün", "şu an", "bu hafta", "bu yıl", "son", "en yeni", "en güncel sürüm"
- Rastlantısal ve **yaratıcı olmayan** çıktı: rastgele sayı, zar, şifre, rastgele kelime listesi, "her seferinde farklı bir soru sor"
- Seçili modele/sisteme bağlı sorular: "Sen hangi modelsin?", "Senin bilgi kesim tarihin ne?"

Örnekler: *Gram altın şu an kaç lira?* · *1–100 arası rastgele 10 sayı üret.* · *Python'un en son sürümü hangisi?*

### 2.3 `sanatsal`
Kullanıcı **özgün bir yaratıcı eser** üretilmesini istiyorsa: şiir, öykü, masal, şarkı sözü, senaryo, mizah yazısı, mektup kurgusu, deneme, slogan.
- "Rastgele", "farklı", "özgün" kelimeleri geçse bile yaratıcı eser isteği **sanatsal**dır.
- Ama yaratıcı istek kullanıcının kişisel verisine/geçmişine dayanıyorsa → **kisisel**.
- Güncel veriye dayanıyorsa → **degisken**.

Örnekler: *Dostluk hakkında dört kıtalık şiir yaz.* · *Kısa bir korku senaryosu yaz.*

### 2.4 `genel`
Yanıt kullanıcıdan bağımsız, yeterince sabit ve başka biri aynı soruyu sorduğunda aynen kullanılabilir:
- Bilgi, tanım, açıklama, nasıl yapılır, tarih, bilim, dil bilgisi, programlama kavramları
- Kendi içinde tam olan, kişisel veri içermeyen görevler (ör. *"'Good morning' Türkçeye nasıl çevrilir?"*)

Örnekler: *Türkiye'nin başkenti neresidir?* · *Fotosentez nasıl gerçekleşir?* · *SQL'de JOIN türleri nelerdir?*

---

## 3. Zor sınırlar (sık karışanlar)

| Soru | Etiket | Neden |
|---|---|---|
| Şiir nedir, aruz ölçüsü nasıl işler? | genel | Bilgi sorusu |
| Aruz ölçüsüyle bir gazel yaz. | sanatsal | Eser üretimi |
| Geçen hafta yazdığım şiiri düzelt. | kisisel | Kullanıcının materyali + geçmiş |
| Rastgele sayı üreteçleri nasıl çalışır? | genel | Kavram açıklaması |
| Rastgele 10 sayı üret. | degisken | Rastlantısal, yaratıcı değil |
| Rastgele üç kelimeyle bir öykü yaz. | sanatsal | Yaratıcı eser |
| Enflasyon nedir? | genel | Kavram |
| Bu ayki enflasyon oranı kaç? | degisken | Güncel veri |
| Bayram neden kutlanır? | genel | Sabit bilgi |
| Bu yıl bayram hangi güne denk geliyor? | degisken | Yıla göre değişir |
| Büyük dil modelleri nasıl çalışır? | genel | Kavram |
| Sen hangi modelsin? | degisken | Seçili modele bağlı |

---

## 3.1 Ek kurallar (v2 — insan test setinden çıkarıldı)

| Durum | Etiket | Örnek |
|---|---|---|
| Kişisel veri içermeyen öneri/tavsiye | genel | *Kelliğe çözümler öner* · *Kış için kombin önerisi* · *Hasta ziyaretine ne götürülür?* |
| Aynı öneri ama kişisel bilgi/durum içeriyor | kisisel | *Şeker hastasıyım, hurma yiyebilir miyim?* · *25 yaşındayım, yatırıma nereden başlamalıyım?* |
| Fiyat, ücret, maaş, kur ("kaç TL", "ne kadar") | degisken | *Çay kaç TL?* · *Proje uzmanı ne kadar maaş alır?* |
| Zamanla değişen listeler (ürünler, en iyiler, güncel eserler) | degisken | *PS5'te en iyi 10 oyun* · *X'in şarkıları nelerdir* |
| Tartışmalı / görüşe dayalı sorular | degisken | *Yapay zeka bir tehdit mi?* · *Para parayı çeker mi?* |
| Yapay zekâya kendisi hakkında varsayımsal soru | degisken | *Bir günlüğüne insan olsan ne yapardın?* |
| Sabit cevabı olmayan, yaratıcı olmayan üretim | degisken | *Matris sınavı oluştur* · *100 kelimelik bir mail oluştur* |
| Önceki mesaja/eksik bağlama atıf ("bu", "şunlara göre") | kisisel | *Bu makaleyi özetle* · *Şunlara göre tatil planı oluştur* |
| Sanat eseri listesi / önerisi | sanatsal | *Çay geçen türküler* |

## 4. Etiketleme yaparken
- Soruyu **yazıldığı gibi** değerlendir; soruyu soranı tahmin etmeye çalışma.
- Yazım hatası, küçük harf, noktalama eksikliği etiketi değiştirmez.
- Emin olamadığın örneğin `notes` sütununa kısa bir açıklama yaz; o örneği birlikte tartışırız.
- Bu kılavuzdaki örnekler **uygulamaya kural olarak eklenmez**; yalnızca etiketleme tutarlılığı içindir.

## 5. Dosya biçimi
CSV, ayraç `;` (Türkçe Excel'de doğrudan sütunlara ayrılır), UTF-8.

| Sütun | Açıklama |
|---|---|
| `id` | Benzersiz kimlik |
| `text` | Soru metni |
| `label` | `genel` / `kisisel` / `degisken` / `sanatsal` |
| `source` | `claude_seed`, `human`, ... |
| `group_id` | Aynı konudaki karşıt örnekler aynı grupta; gruplar eğitim/test arasında bölünmez |
| `notes` | Serbest not |
