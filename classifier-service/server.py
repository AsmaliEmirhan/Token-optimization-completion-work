"""TokenAI L1 — yerel BERTurk soru sınıflandırma servisi.

Yalnızca 127.0.0.1 üzerinde dinler; soru metni bilgisayar dışına çıkmaz.

Uç noktalar
  GET  /health    -> {"status": "ok", "model_version", "labels", "tau", "device"}
  POST /classify  {"text": "..."} ->
       {"label", "probs": {etiket: olasılık}, "p_genel", "model_version", "tau", "latency_ms", "truncated"}

Önbellek kararı (genel ve p_genel >= tau) Node tarafında verilir; servis yalnızca olasılık döndürür.

Ortam değişkenleri (hepsi isteğe bağlı)
  TOKENAI_CLASSIFIER_MODEL_DIR  model klasörü (varsayılan: ../ml/models/model)
  TOKENAI_CLASSIFIER_PORT       port (varsayılan: 8765)
  TOKENAI_CLASSIFIER_THREADS    CPU iş parçacığı sayısı (varsayılan: 2)
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get("TOKENAI_CLASSIFIER_MODEL_DIR", ROOT.parent / "ml" / "models" / "model")).resolve()
HOST = "127.0.0.1"
PORT = int(os.environ.get("TOKENAI_CLASSIFIER_PORT", "8765"))
MAX_CHARS = 4000          # bundan uzun metin reddedilmez, kırpılır (model zaten 128 token görür)
MAX_BODY = 64 * 1024


def log(msg):
    print(f"[Sınıflandırıcı] {msg}", flush=True)


def load_model():
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    if not (MODEL_DIR / "config.json").exists():
        log(f"HATA: Model bulunamadı: {MODEL_DIR}")
        log("ml/models/model klasörüne Colab'dan indirilen model.zip içeriğini çıkarın.")
        sys.exit(2)
    calib = json.loads((MODEL_DIR / "calibration.json").read_text(encoding="utf-8"))
    torch.set_num_threads(int(os.environ.get("TOKENAI_CLASSIFIER_THREADS", "2")))
    tok = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR).eval()
    labels = [model.config.id2label[i] for i in range(model.config.num_labels)]
    if labels != calib["labels"]:
        log(f"HATA: Model etiketleri {labels} ile calibration.json {calib['labels']} uyuşmuyor.")
        sys.exit(2)
    with torch.no_grad():  # ısınma
        model(**tok("ısınma", return_tensors="pt"))
    return torch, tok, model, calib, labels


torch, TOK, MODEL, CALIB, LABELS = load_model()
LOCK = threading.Lock()  # tek model örneği; istekleri sırayla işler (CPU'da en kararlı yol)
log(f"Model yüklendi: {CALIB['model_version']}  etiketler={LABELS}  τ(kalibrasyon)={CALIB['tau']}")


def classify(text: str) -> dict:
    t0 = time.perf_counter()
    truncated = len(text) > MAX_CHARS
    text = text[:MAX_CHARS]
    with LOCK, torch.no_grad():
        enc = TOK(text, truncation=True, max_length=int(CALIB.get("max_len", 128)), return_tensors="pt")
        truncated = truncated or bool(len(TOK(text)["input_ids"]) > enc["input_ids"].shape[1])
        logits = MODEL(**enc).logits[0] / float(CALIB["temperature"])
        probs = torch.softmax(logits, -1).tolist()
    best = max(range(len(LABELS)), key=lambda i: probs[i])
    return {
        "label": LABELS[best],
        "probs": {l: round(p, 6) for l, p in zip(LABELS, probs)},
        "p_genel": round(probs[LABELS.index("genel")], 6),
        "model_version": CALIB["model_version"],
        "tau": CALIB["tau"],
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        "truncated": truncated,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "TokenAIClassifier/1.0"

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"status": "ok", "model_version": CALIB["model_version"], "labels": LABELS,
                             "tau": CALIB["tau"], "device": "cpu"})
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/classify":
            self._send(404, {"error": "not_found"})
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > MAX_BODY:
                self._send(413 if n > MAX_BODY else 400, {"error": "invalid_body_size"})
                return
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            text = data.get("text") if isinstance(data, dict) else None
            if not isinstance(text, str) or not text.strip():
                self._send(400, {"error": "text_required"})
                return
            self._send(200, classify(text.strip()))
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid_json"})
        except Exception as e:  # noqa: BLE001
            log(f"Sınıflandırma hatası: {type(e).__name__}")
            self._send(500, {"error": "classification_failed"})

    def log_message(self, fmt, *args):  # istek metinlerini loglamayalım
        pass


if __name__ == "__main__":
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"Hazır: http://{HOST}:{PORT}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
