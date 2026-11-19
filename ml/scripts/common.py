"""Ortak yardımcılar: etiketler, Türkçe normalizasyon, CSV okuma."""
import csv
import re
from pathlib import Path

LABELS = ["genel", "kisisel", "degisken", "sanatsal"]
LABEL2ID = {l: i for i, l in enumerate(LABELS)}
CACHEABLE_LABEL = "genel"

_LABEL_FIX = str.maketrans({"ş": "s", "ğ": "g", "ı": "i", "ü": "u", "ö": "o", "ç": "c", "İ": "i", "Ş": "s", "Ğ": "g", "Ü": "u", "Ö": "o", "Ç": "c"})


def tr_lower(s: str) -> str:
    return s.replace("I", "ı").replace("İ", "i").lower()


def normalize_label(raw: str) -> str:
    lab = (raw or "").strip().translate(_LABEL_FIX).lower()
    if lab not in LABEL2ID:
        raise ValueError(f"Geçersiz etiket: {raw!r}")
    return lab


def dedup_key(text: str) -> str:
    """Tekrar tespiti için anahtar (eğitimde metnin kendisi değiştirilmez)."""
    t = tr_lower(text)
    t = re.sub(r"['’`´]", "", t)          # Türkiye'nin == Türkiyenin
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def clean_text(text: str) -> str:
    """Modele verilecek metin: sadece boşluk düzeltmesi; anlam değiştiren işlem yok."""
    return re.sub(r"\s+", " ", (text or "")).strip()


def read_csv(path: Path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        delim = ";" if sample.count(";") >= sample.count(",") else ","
        rows = []
        for i, r in enumerate(csv.DictReader(f, delimiter=delim)):
            text = clean_text(r.get("text", ""))
            if not text:
                continue
            rows.append({
                "id": (r.get("id") or f"{path.stem}-{i}").strip(),
                "text": text,
                "label": normalize_label(r.get("label", "")),
                "source": (r.get("source") or path.stem).strip(),
                "group_id": (r.get("group_id") or "").strip(),
            })
        return rows
