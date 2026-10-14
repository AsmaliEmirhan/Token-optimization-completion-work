import type { ExactCacheEntry, ExactCacheStore } from './cacheTypes.js';

export interface InMemoryExactCacheOptions {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
}

export class InMemoryExactCache implements ExactCacheStore {
  private readonly entries = new Map<string, ExactCacheEntry>();
  private readonly now: () => number;
  readonly ttlMs: number;
  readonly maxEntries: number;

  constructor(options: InMemoryExactCacheOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) throw new Error('maxEntries pozitif bir tam sayı olmalıdır.');
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) throw new Error('ttlMs pozitif olmalıdır.');
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    this.removeExpired(this.now());
    return this.entries.size;
  }

  get(key: string, now = this.now()): ExactCacheEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    // Süresi dolan kayıtları kullanmadan hemen siliyoruz; böylece eski yanıtlar geri dönmez.
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }

    // Map içindeki sırayı yenileyerek erişilen kaydı LRU kuyruğunun sonuna taşıyoruz.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(entry: ExactCacheEntry): void {
    this.removeExpired(this.now());
    // Aynı anahtarı silip yeniden eklemek hem kopyayı engeller hem de kaydı en yeni konuma taşır.
    this.entries.delete(entry.key);
    this.entries.set(entry.key, entry);

    while (this.entries.size > this.maxEntries) {
      const leastRecentlyUsedKey = this.entries.keys().next().value as string | undefined;
      if (!leastRecentlyUsedKey) break;
      // Kapasite aşıldığında deterministik olarak en uzun süredir kullanılmayan kayıt çıkarılır.
      this.entries.delete(leastRecentlyUsedKey);
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  private removeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
