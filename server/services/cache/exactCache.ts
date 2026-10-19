import type { CacheInvalidation, CacheScope, ExactCacheEntry, ExactCacheStore } from './cacheTypes.js';

export interface InMemoryExactCacheOptions {
  maxEntries: number;
  ttlMs: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  maxSharedEntries?: number;
  maxPrivateEntries?: number;
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
  readonly maxSharedEntries: number;
  readonly maxPrivateEntries: number;

  constructor(options: InMemoryExactCacheOptions) {
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
    this.maxEntryBytes = options.maxEntryBytes ?? 256 * 1024;
    this.maxTotalBytes = options.maxTotalBytes ?? 16 * 1024 * 1024;
    this.maxSharedEntries = options.maxSharedEntries ?? this.maxEntries;
    this.maxPrivateEntries = options.maxPrivateEntries ?? this.maxEntries;
    for (const value of [this.maxEntries, this.ttlMs, this.maxEntryBytes, this.maxTotalBytes, this.maxSharedEntries, this.maxPrivateEntries]) {
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
    // Bu sürümde özel içerik hiçbir cache kaydına yazılamaz.
    if (snapshot.scope !== 'shared' || snapshot.scopeId !== null || !snapshot.policyVersion ||
        snapshot.validationStatus !== 'approved' || snapshot.decision?.sharingResult?.status !== 'approved' ||
        snapshot.decision.sharingResult.classification !== 'public_shareable' ||
        snapshot.decision?.eligibilityResult?.scope !== 'shared' ||
        snapshot.decision.eligibilityResult.sharing?.status !== 'approved' || !snapshot.decision.eligibilityResult.eligible ||
        snapshot.decision.eligibilityResult.classification !== 'public_shareable' ||
        snapshot.decision.eligibilityResult.policyVersion !== snapshot.policyVersion) return false;
    snapshot.expiresAt = Math.min(snapshot.expiresAt, snapshot.createdAt + this.ttlMs);
    if (!Number.isFinite(snapshot.createdAt) || !Number.isFinite(snapshot.expiresAt) ||
        snapshot.createdAt > now || snapshot.expiresAt <= now) return false;
    const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    // JSON bayt bütçesi bir bellek üst sınırı yaklaşımıdır; V8 nesne ek yükünü ölçmez.
    if (bytes > this.maxEntryBytes || bytes > this.maxTotalBytes) return false;
    // Başarısız büyük yazım, aynı anahtarda önceden doğrulanmış kaydı silmemeli.
    this.remove(entry.key);
    this.entries.set(entry.key, { entry: snapshot, bytes });
    this.usedBytes += bytes;
    const shared = snapshot.scope === 'shared';
    const inPartition = (scope: CacheScope) => (scope === 'shared') === shared;
    const partitionLimit = shared ? this.maxSharedEntries : this.maxPrivateEntries;
    // Ayrı bölüm kotaları bir kapsamın bütün önbelleği doldurmasını sınırlar; toplam bayt sınırı ayrıca korunur.
    while ([...this.entries.values()].filter(value => inPartition(value.entry.scope)).length > partitionLimit) {
      const oldest = [...this.entries].find(([, value]) => inPartition(value.entry.scope));
      if (!oldest) break;
      this.remove(oldest[0]);
    }
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

  invalidate(filter: CacheInvalidation): number {
    // Politika değişiminde devam eden eski üretim de yeni kuralların dışından kayıt yazamaz.
    this.revision++;
    let removed = 0;
    for (const [key, { entry }] of this.entries) {
      if ((filter.scope === undefined || entry.scope === filter.scope) &&
          (filter.scopeId === undefined || entry.scopeId === filter.scopeId) &&
          (filter.policyVersion === undefined || entry.policyVersion === filter.policyVersion) &&
          (filter.incompatiblePolicyVersion === undefined || entry.policyVersion !== filter.incompatiblePolicyVersion)) {
        this.remove(key); removed++;
      }
    }
    return removed;
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
