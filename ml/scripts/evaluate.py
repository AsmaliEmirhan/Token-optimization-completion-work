"""Kalibrasyon, eşik (tau) seçimi ve test raporu.

1. Doğrulama setinde temperature scaling: olasılıkların gerçekçi olmasını sağlar.
2. Doğrulama setinde tau seçimi: "genel" denip önbelleğe alınacak soruların
   en az --target_precision oranında gerçekten genel olmasını sağlayan EN DÜŞÜK eşik.
3. İnsan yazımı test setinde (hiç eğitimde görülmedi) sonuçların raporlanması.

Önbellek kararı:  önbelleğe_al  <=>  argmax == genel  VE  p(genel) >= tau
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHEABLE_LABEL, LABEL2ID, LABELS  # noqa: E402
from train import load_jsonl, make_loader, predict_logits  # noqa: E402

G = LABEL2ID[CACHEABLE_LABEL]


def fit_temperature(logits, labels):
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200)
    ce = torch.nn.CrossEntropyLoss()

    def closure():
        opt.zero_grad()
        loss = ce(logits / log_t.exp(), labels)
        loss.backward()
        return loss
    opt.step(closure)
    return float(log_t.exp().clamp(0.05, 20.0))


def cache_metrics(probs, labels, tau):
    pred_cache = (probs.argmax(1) == G) & (probs[:, G] >= tau)
    is_genel = labels == G
    tp = int((pred_cache & is_genel).sum())
    fp = int((pred_cache & ~is_genel).sum())
    prec = tp / (tp + fp) if tp + fp else 1.0
    cov = tp / int(is_genel.sum()) if is_genel.sum() else 0.0
    return {"tau": tau, "cached": tp + fp, "precision_genel": prec, "coverage_genel": cov,
            "critical_errors": fp}, pred_cache


def choose_tau(probs, labels, target):
    for tau in np.round(np.arange(0.50, 0.9991, 0.005), 3):
        m, _ = cache_metrics(probs, labels, float(tau))
        if m["cached"] >= 5 and m["precision_genel"] >= target:
            return float(tau), m
    m, _ = cache_metrics(probs, labels, 1.01)
    return 1.01, m  # hiçbir şey önbelleğe alınmaz


def md_table(headers, rows):
    s = "| " + " | ".join(headers) + " |\n|" + "---|" * len(headers) + "\n"
    for r in rows:
        s += "| " + " | ".join(str(x) for x in r) + " |\n"
    return s


def main():
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parent.parent
    ap.add_argument("--model_dir", default=str(root / "outputs" / "model"))
    ap.add_argument("--splits_dir", default=str(root / "data" / "splits"))
    ap.add_argument("--report", default=str(root / "outputs" / "report.md"))
    ap.add_argument("--target_precision", type=float, default=0.98)
    a = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    md = Path(a.model_dir)
    tok = AutoTokenizer.from_pretrained(md)
    model = AutoModelForSequenceClassification.from_pretrained(md).to(device)
    meta = json.loads((md / "training_meta.json").read_text(encoding="utf-8"))
    sd = Path(a.splits_dir)
    val, test = load_jsonl(sd / "val.jsonl"), load_jsonl(sd / "test.jsonl")

    vlog, vlab = predict_logits(model, make_loader(val, tok, meta["max_len"], 64, False), device)
    tlog, tlab = predict_logits(model, make_loader(test, tok, meta["max_len"], 64, False), device)

    T = fit_temperature(vlog, vlab)
    vprob, tprob = torch.softmax(vlog / T, -1), torch.softmax(tlog / T, -1)
    tau, val_m = choose_tau(vprob, vlab, a.target_precision)
    test_m, test_cache = cache_metrics(tprob, tlab, tau)

    version = "berturk-l1-" + time.strftime("%Y%m%d-%H%M")
    calib = {"model_version": version, "labels": LABELS, "cacheable_label": CACHEABLE_LABEL,
             "temperature": T, "tau": tau, "target_precision": a.target_precision,
             "max_len": meta["max_len"], "base_model": meta["base_model"]}
    (md / "calibration.json").write_text(json.dumps(calib, ensure_ascii=False, indent=2), encoding="utf-8")

    tpred = tprob.argmax(1)
    acc = float((tpred == tlab).float().mean())
    mf1 = f1_score(tlab, tpred, average="macro")
    cm = confusion_matrix(tlab, tpred, labels=list(range(len(LABELS))))
    rep = classification_report(tlab, tpred, labels=list(range(len(LABELS))), target_names=LABELS,
                                digits=3, zero_division=0, output_dict=True)

    crit = [(test[i]["id"], test[i]["text"], test[i]["label"], f"{tprob[i, G]:.3f}")
            for i in range(len(test)) if test_cache[i] and tlab[i] != G]
    missed = [(test[i]["id"], test[i]["text"], LABELS[int(tpred[i])], f"{tprob[i, G]:.3f}")
              for i in range(len(test)) if tlab[i] == G and not test_cache[i]]
    wrong = [(test[i]["id"], test[i]["text"], test[i]["label"], LABELS[int(tpred[i])], f"{tprob[i].max():.3f}")
             for i in range(len(test)) if tpred[i] != tlab[i]]

    lines = [f"# BERTurk L1 Sınıflandırıcı Raporu — `{version}`\n",
             f"- Temel model: `{meta['base_model']}`",
             f"- Eğitim tarihi: {meta['trained_at']}",
             f"- En iyi doğrulama macro-F1: **{meta['best_val_macro_f1']:.3f}**",
             f"- Sıcaklık (temperature): {T:.3f}",
             f"- Seçilen eşik **τ = {tau}** (doğrulamada hedef genel-precision ≥ {a.target_precision})\n",
             ("> ⚠️ **Hedef precision'a ulaşan eşik bulunamadı; model şu haliyle hiçbir soruyu önbelleğe almaz.** "
              "Veri artırılmalı veya model yeniden eğitilmeli.\n" if tau > 1 else ""),
             "## 1. Önbellek kararı (asıl önemli olan)\n",
             md_table(["Set", "Önbelleğe alınan", "Genel precision", "Genel coverage", "Kritik hata (genel olmayan önbelleğe girdi)"],
                      [["Doğrulama", val_m["cached"], f"{val_m['precision_genel']:.3f}", f"{val_m['coverage_genel']:.3f}", val_m["critical_errors"]],
                       ["**Test (insan yazımı)**", test_m["cached"], f"**{test_m['precision_genel']:.3f}**", f"{test_m['coverage_genel']:.3f}", f"**{test_m['critical_errors']}**"]]),
             "## 2. Dört sınıflı başarı (test)\n",
             f"- Doğruluk (accuracy): {acc:.3f}",
             f"- Macro-F1: {mf1:.3f}\n",
             md_table(["Sınıf", "Precision", "Recall", "F1", "Örnek"],
                      [[l, f"{rep[l]['precision']:.3f}", f"{rep[l]['recall']:.3f}", f"{rep[l]['f1-score']:.3f}", int(rep[l]["support"])] for l in LABELS]),
             "### Karışıklık matrisi (satır = gerçek, sütun = tahmin)\n",
             md_table([""] + LABELS, [[LABELS[i]] + list(map(int, cm[i])) for i in range(len(LABELS))]),
             "## 3. Kritik hatalar — önbelleğe girecek olan genel-olmayan sorular\n",
             md_table(["id", "Soru", "Gerçek", "p(genel)"], crit) if crit else "_Yok._\n",
             "## 4. Kaçırılan genel sorular (önbellek fırsatı kaybı)\n",
             md_table(["id", "Soru", "Tahmin", "p(genel)"], missed) if missed else "_Yok._\n",
             "## 5. Tüm yanlış sınıflandırmalar\n",
             md_table(["id", "Soru", "Gerçek", "Tahmin", "Güven"], wrong) if wrong else "_Yok._\n",
             "## 6. Eğitim geçmişi\n",
             md_table(["Epoch", "Eğitim kaybı", "Doğr. macro-F1", "Doğr. acc", "Süre (sn)"],
                      [[h["epoch"], f"{h['train_loss']:.4f}", f"{h['val_macro_f1']:.3f}", f"{h['val_acc']:.3f}", h["sec"]] for h in meta["history"]])]
    rp = Path(a.report)
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:12]))
    print(f"\nRapor: {rp}")


if __name__ == "__main__":
    main()
