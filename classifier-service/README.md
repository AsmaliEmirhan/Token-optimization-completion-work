# TokenAI — Yerel BERTurk Sınıflandırıcı Servisi

L1 önbelleğinde soruları `genel / kisisel / degisken / sanatsal` olarak etiketleyen yerel servis.
Yalnızca `127.0.0.1:8765` üzerinde dinler; sorular bilgisayar dışına gönderilmez, harici API anahtarı gerekmez.

## Kurulum (bir kez)

```bash
pip install -r classifier-service/requirements.txt
```

Model dosyaları `ml/models/model/` klasöründe olmalıdır. Modeli [Google Drive'dan](https://drive.google.com/drive/folders/1utwkAlprkEUlB6mAqTqom4EIHTSW9-Zj?usp=sharing) indirip `model.zip` dosyasını `ml/models/` içine çıkarın.

## Çalıştırma

`npm run dev` servisi otomatik başlatır. Elle başlatmak için:

```bash
python classifier-service/server.py
```

Servis çalışmazsa uygulama kapanmaz: L1 istekleri `CLASSIFIER_UNAVAILABLE` nedeniyle BYPASS olur, sohbet normal devam eder.

## Uç noktalar

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/health` | Model sürümü ve durum |
| POST | `/classify` | `{"text": "..."}` → etiket ve dört sınıfın olasılıkları |

## Önbellek kararı (Node tarafında)

```
önbelleğe al  <=>  etiket == genel  VE  p(genel) >= τ     (τ: TOKENAI_CLASSIFIER_TAU, varsayılan 0.90)
```

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `TOKENAI_CLASSIFIER_MODEL_DIR` | `ml/models/model` | Model klasörü |
| `TOKENAI_CLASSIFIER_PORT` | `8765` | Port |
| `TOKENAI_CLASSIFIER_THREADS` | `2` | CPU iş parçacığı |
