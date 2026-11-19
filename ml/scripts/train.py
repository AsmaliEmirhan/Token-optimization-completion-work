"""BERTurk ince ayar (fine-tuning) — 4 sınıflı soru sınıflandırıcı.

Mimari: BERTurk encoder -> [CLS] -> Dropout -> Linear(768 -> 4)
(AutoModelForSequenceClassification bu başlığı kurar.)

Bilerek sade bir PyTorch döngüsü kullanılır (Trainer API sürüm farklarından etkilenmemek için).
En iyi epoch, doğrulama setindeki macro-F1'e göre seçilir.
"""
import argparse
import json
import math
import random
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import LABEL2ID, LABELS  # noqa: E402


def load_jsonl(p):
    with open(p, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def set_seed(s):
    random.seed(s); np.random.seed(s); torch.manual_seed(s); torch.cuda.manual_seed_all(s)


def make_loader(rows, tok, max_len, bs, shuffle):
    def collate(batch):
        enc = tok([r["text"] for r in batch], truncation=True, max_length=max_len,
                  padding=True, return_tensors="pt")
        enc["labels"] = torch.tensor([LABEL2ID[r["label"]] for r in batch])
        return enc
    return DataLoader(rows, batch_size=bs, shuffle=shuffle, collate_fn=collate)


@torch.no_grad()
def predict_logits(model, loader, device):
    model.eval()
    out_logits, out_labels = [], []
    for b in loader:
        labels = b.pop("labels")
        b = {k: v.to(device) for k, v in b.items()}
        out_logits.append(model(**b).logits.float().cpu())
        out_labels.append(labels)
    return torch.cat(out_logits), torch.cat(out_labels)


def main():
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parent.parent
    ap.add_argument("--model_name", default="dbmdz/bert-base-turkish-cased")
    ap.add_argument("--splits_dir", default=str(root / "data" / "splits"))
    ap.add_argument("--out_dir", default=str(root / "outputs" / "model"))
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--batch_size", type=int, default=16)
    ap.add_argument("--max_len", type=int, default=128)
    ap.add_argument("--warmup_ratio", type=float, default=0.1)
    ap.add_argument("--weight_decay", type=float, default=0.01)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no_class_weights", action="store_true",
                    help="Sınıf ağırlıklarını kapat (varsayılan: dengesiz sınıflar için ağırlıklı kayıp)")
    a = ap.parse_args()

    set_seed(a.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Cihaz: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device == "cuda" else
                                 "  ⚠️ GPU yok — Colab'da Çalışma zamanı > T4 GPU seçin"))

    sd = Path(a.splits_dir)
    train, val = load_jsonl(sd / "train.jsonl"), load_jsonl(sd / "val.jsonl")
    print(f"Eğitim: {len(train)}  Doğrulama: {len(val)}")

    tok = AutoTokenizer.from_pretrained(a.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        a.model_name, num_labels=len(LABELS),
        id2label={i: l for i, l in enumerate(LABELS)}, label2id=LABEL2ID).to(device)

    counts = torch.tensor([sum(1 for r in train if r["label"] == l) for l in LABELS], dtype=torch.float)
    weights = None if a.no_class_weights else (counts.sum() / (len(LABELS) * counts.clamp(min=1))).to(device)
    loss_fn = torch.nn.CrossEntropyLoss(weight=weights)
    print("Sınıf sayıları:", dict(zip(LABELS, counts.int().tolist())),
          "| ağırlıklar:", None if weights is None else [round(w, 2) for w in weights.tolist()])

    tl = make_loader(train, tok, a.max_len, a.batch_size, True)
    vl = make_loader(val, tok, a.max_len, 64, False)

    no_decay = ("bias", "LayerNorm.weight", "LayerNorm.bias")
    params = [
        {"params": [p for n, p in model.named_parameters() if not any(x in n for x in no_decay)], "weight_decay": a.weight_decay},
        {"params": [p for n, p in model.named_parameters() if any(x in n for x in no_decay)], "weight_decay": 0.0},
    ]
    opt = torch.optim.AdamW(params, lr=a.lr)
    total = len(tl) * a.epochs
    warm = max(1, int(a.warmup_ratio * total))
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: (s + 1) / warm if s < warm else max(0.0, (total - s) / max(1, total - warm)))
    use_amp = device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    best_f1, history = -1.0, []
    for ep in range(1, a.epochs + 1):
        model.train()
        t0, run_loss = time.time(), 0.0
        for step, b in enumerate(tl, 1):
            labels = b.pop("labels").to(device)
            b = {k: v.to(device) for k, v in b.items()}
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                logits = model(**b).logits
            loss = loss_fn(logits.float(), labels)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt); scaler.update(); sched.step()
            run_loss += loss.item()
        logits, labels = predict_logits(model, vl, device)
        preds = logits.argmax(-1)
        f1 = f1_score(labels, preds, average="macro")
        acc = (preds == labels).float().mean().item()
        rec = {"epoch": ep, "train_loss": run_loss / len(tl), "val_macro_f1": f1, "val_acc": acc,
               "sec": round(time.time() - t0, 1)}
        history.append(rec)
        print(json.dumps(rec))
        if f1 > best_f1:
            best_f1 = f1
            model.save_pretrained(out)
            tok.save_pretrained(out)
            print(f"  ↳ en iyi model kaydedildi (macro-F1={f1:.4f})")

    meta = {"base_model": a.model_name, "labels": LABELS, "max_len": a.max_len,
            "best_val_macro_f1": best_f1, "history": history, "hparams": vars(a),
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    (out / "training_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
