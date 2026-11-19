# ml/ — BERTurk L1 Soru Sınıflandırıcısı

Bu klasör, L1 önbelleği için soruları `genel / kisisel / degisken / sanatsal` olarak etiketleyen
BERTurk modelinin verisini ve eğitim kodunu içerir. Model dosyaları (`models/`, `outputs/`) GitHub'a gönderilmez.

## Eğitilmiş modeli indirme

Model dosyaları (~440 MB) GitHub'da tutulmaz. Güncel model Google Drive'da:

**[Model klasörü (Google Drive)](https://drive.google.com/drive/folders/1utwkAlprkEUlB6mAqTqom4EIHTSW9-Zj?usp=sharing)** — sürüm `berturk-l1-20261118-1533`

`model.zip` dosyasını indirip `ml/models/` klasörüne çıkarın; sonuçta `ml/models/model/` klasörü oluşmalı
(içinde `model.safetensors`, `config.json`, `calibration.json`, `tokenizer.json` ...).

## Klasör yapısı
| Yol | İçerik |
|---|---|
| `guidelines.md` | Etiketleme kılavuzu (v2) |
| `data/seed.csv` | İlk 300 örnek (her konudan 4 karşıt soru) |
| `data/pool/*.csv` | Ek eğitim verisi |
| `data/test_human.csv` | İnsan yazımı test seti — **eğitime hiç girmez** |
| `scripts/prepare_data.py` | Temizlik, tekrar/sızıntı kontrolü, grup bazlı bölme |
| `scripts/train.py` | BERTurk ince ayar |
| `scripts/evaluate.py` | Kalibrasyon, τ eşiği seçimi, rapor |
| `train_colab.ipynb` | Colab'da tek tıkla çalışan defter |

## Modeli yeniden eğitmek (Colab)

1. Bu `ml` klasörünün tamamını **Google Drive'ın ana dizinine** yükle (Drive'da `Drive'ım/ml` olacak).
2. Drive'da `ml/train_colab.ipynb` dosyasına çift tıkla → **Google Colaboratory** ile aç.
3. Menü: **Çalışma zamanı → Çalışma zamanı türünü değiştir → T4 GPU → Kaydet**.
4. Menü: **Çalışma zamanı → Tümünü çalıştır**. Drive izni sorarsa onayla.
5. 15–25 dk bekle. Bitince Drive'da `ml/outputs/` içinde:
   - `model.zip` → indir, bilgisayarında `LUAS/ml/models/` klasörüne çıkar
   - `report.md` → indir, `LUAS/ml/reports/` klasörüne koy

Bir hücre hata verirse hata mesajının ekran görüntüsünü Claude'a gönder.
