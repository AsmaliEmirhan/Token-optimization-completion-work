"""Eğitim verisini hazırlar.

Girdi:
  data/seed.csv, data/pool/*.csv  -> eğitim + doğrulama havuzu
  data/test_human.csv             -> test seti (hiç eğitime girmez)
Çıktı:
  data/splits/{train,val,test}.jsonl ve data/splits/stats.json

Kurallar:
  * Etiketler normalize edilir (kişisel -> kisisel).
  * Havuzda birebir aynı metinler tek kayda indirilir; aynı soruya farklı etiket verilmişse (çelişki)
    tümü raporlanıp atılır.
  * Test setindeki bir metnin aynısı havuzda varsa havuzdan çıkarılır (sızıntı önleme).
  * Bölme group_id bazında yapılır: aynı gruptaki örnekler aynı tarafa düşer.
"""
import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from common import LABELS, dedup_key, read_csv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", default=str(Path(__file__).resolve().parent.parent / "data"))
    ap.add_argument("--val_ratio", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()

    data = Path(a.data_dir)
    pool_files = [data / "seed.csv"] + sorted((data / "pool").glob("*.csv"))
    pool = [r for p in pool_files if p.exists() for r in read_csv(p)]
    test = read_csv(data / "test_human.csv")

    # Test içi tekrarlar
    seen, test_clean = set(), []
    for r in test:
        k = dedup_key(r["text"])
        if k not in seen:
            seen.add(k)
            test_clean.append(r)
    test_keys = seen

    # Havuz: tekrar ve çelişki temizliği
    by_key = defaultdict(list)
    for r in pool:
        by_key[dedup_key(r["text"])].append(r)
    conflicts, leaked, pool_clean = [], 0, []
    for k, rs in by_key.items():
        if k in test_keys:
            leaked += len(rs)
            continue
        labs = {r["label"] for r in rs}
        if len(labs) > 1:
            conflicts.append({"text": rs[0]["text"], "labels": sorted(labs)})
            continue
        # Aynı anahtara düşen yazım varyantları (büyük/küçük harf, noktalama) ayrı örnek olarak kalır:
        # BERTurk cased olduğu için bu varyantlar modele farklı görünür. Birebir aynı metinler tek kayda iner.
        seen_exact = set()
        for r in rs:
            if r["text"] not in seen_exact:
                seen_exact.add(r["text"])
                pool_clean.append(r)

    for r in pool_clean + test_clean:
        if not r["group_id"]:
            r["group_id"] = "auto-" + r["id"]

    # Grup bazlı, etiket dağılımını koruyan bölme
    rng = random.Random(a.seed)
    groups = defaultdict(list)
    for r in pool_clean:
        groups[r["group_id"]].append(r)
    gids = sorted(groups)
    rng.shuffle(gids)
    target_val = a.val_ratio * len(pool_clean)
    val_counts, val, train = Counter(), [], []
    per_label_target = {l: a.val_ratio * sum(1 for r in pool_clean if r["label"] == l) for l in LABELS}
    for g in gids:
        rs = groups[g]
        need = len(val) < target_val and all(
            val_counts[r["label"]] < per_label_target[r["label"]] + 2 for r in rs)
        (val if need else train).extend(rs)
        if need:
            val_counts.update(r["label"] for r in rs)

    out = data / "splits"
    out.mkdir(parents=True, exist_ok=True)
    for name, rows in (("train", train), ("val", val), ("test", test_clean)):
        with open(out / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    stats = {
        "pool_files": [p.name for p in pool_files if p.exists()],
        "pool_raw": len(pool), "test_raw": len(test),
        "removed_test_leak": leaked, "removed_conflicts": len(conflicts),
        "conflict_examples": conflicts[:20],
        "train": dict(Counter(r["label"] for r in train)), "train_n": len(train),
        "val": dict(Counter(r["label"] for r in val)), "val_n": len(val),
        "test": dict(Counter(r["label"] for r in test_clean)), "test_n": len(test_clean),
    }
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
