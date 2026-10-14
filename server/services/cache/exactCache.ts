import type { ExactCacheEntry, ExactCacheStore } from './cacheTypes.js';

export interface InMemoryExactCacheOptions {
  maxEntries: number;
  ttlMs: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  now?: () => number;
}

export class InMemoryExactCache implements ExactCacheStore {
  private readonly entries = new Map<string, { entry: ExactCacheEntry; bytes: number }>();
  private readonly now: () => number;
  private usedBytes = 0;
  // clear/delete sırasında devam eden bir üretimin eski kaydı yeniden yazmasını engeller.
  private revision = 0;
  readonly ttlMs: number;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;

  constructor(options: InMemoryExactCacheOptions) {
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
    this.maxEntryBytes = options.maxEntryBytes ?? 256 * 1024;
    this.maxTotalBytes = options.maxTotalBytes ?? 16 * 1024 * 1024;
    for (const value of [this.maxEntries, this.ttlMs, this.maxEntryBytes, this.maxTotalBytes]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Cache sınırları pozitif güvenli tam sayı olmalıdır.');
    }
    this.now = options.now ?? Date.now;
  }

  get generation(): number { return this.revision; }
  get size(): number { this.removeExpired(this.now()); return this.entries.size; }
  get byteSize(): number { this.removeExpired(this.now()); return this.usedBytes; }

  get(key: string, now = this.now()): ExactCacheEntry | null {
    const stored = this.entries.get(key);
    if (!stored) return null;
    if (stored.entry.expiresAt <= now) {
      this.remove(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, stored);
    // Çağıran kodun saklanan kaydı sonradan değiştirmesine izin vermiyoruz.
    return structuredClone(stored.entry);
  }

  set(entry: ExactCacheEntry): boolean {
    const now = this.now();
    this.removeExpired(now);
    const snapshot = structuredClone(entry);
    snapshot.expiresAt = Math.min(snapshot.expiresAt, snapshot.createdAt + this.ttlMs);
    if (!Number.isFinite(snapshot.createdAt) || !Number.isFinite(snapshot.expiresAt) ||
        snapshot.createdAt > now || snapshot.expiresAt <= now) return false;
    const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    // JSON bayt bütçesi bir bellek üst sınırı yaklaşımıdır; V8 nesne ek yükünü ölçmez.
    this.remove(entry.key);
    if (bytes > this.maxEntryBytes || bytes > this.maxTotalBytes) return false;
    this.entries.set(entry.key, { entry: snapshot, bytes });
    this.usedBytes += bytes;
    while (this.entries.size > this.maxEntries || this.usedBytes > this.maxTotalBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    return true;
  }

  delete(key: string): boolean {
    this.revision++;
    return this.remove(key);
  }

  clear(): void {
    this.revision++;
    this.entries.clear();
    this.usedBytes = 0;
  }

  private remove(key: string): boolean {
    const stored = this.entries.get(key);
    if (!stored) return false;
    this.usedBytes -= stored.bytes;
    return this.entries.delete(key);
  }

  private removeExpired(now: number): void {
    for (const [key, stored] of this.entries) {
      if (stored.entry.expiresAt <= now) this.remove(key);
    }
  }
}
