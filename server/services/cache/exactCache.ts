import { config } from '../../config/env.js';
import { generateExactCacheKey, type CacheKeyParams } from './cacheKey.js';
import { mysqlStorageService, type ICacheStorage } from './mysqlClient.js';
import type { CachedL1Entry, CacheLookupResult, ClassificationDecision } from './cacheTypes.js';
import { validateResponseForCache } from './responseValidator.js';

/** stored: yazıldı · skipped: politika gereği yazılmadı · rejected: yanıt uygunluk kontrolünden geçmedi · failed: depolama hatası */
export type StoreResult = 'stored' | 'skipped' | 'rejected' | 'failed';

export class ExactCacheService {
  constructor(
    private storage: ICacheStorage = mysqlStorageService
  ) {}

  /**
   * Performs an exact-match lookup in the L1 Cache (MySQL permanent storage by default).
   * Returns HIT with entry if valid, MISS if not found, or BYPASS if database is not reachable.
   */
  async lookup(params: CacheKeyParams): Promise<CacheLookupResult> {
    if (!config.l1Enabled) {
      return { hit: false, status: 'BYPASS', bypassReason: 'L1_DISABLED', latencyMs: 0 };
    }

    const policyVersion = params.policyVersion || config.l1PolicyVersion;
    const { key } = generateExactCacheKey({ ...params, policyVersion });
    const start = performance.now();

    try {
      const entry = await this.storage.get(key);
      const latencyMs = Math.round(performance.now() - start);

      if (!entry) {
        // Kayıt yoksa: veritabanı erişilebilirse MISS, değilse nedeniyle birlikte BYPASS
        return this.storage.isAvailable()
          ? { hit: false, status: 'MISS', latencyMs }
          : { hit: false, status: 'BYPASS', bypassReason: 'DB_UNAVAILABLE', latencyMs };
      }

      // Politika sürümü uyumsuzsa kayıt kullanılmaz
      if (entry.version !== policyVersion) {
        console.warn('[ExactCache] Incompatible cache version detected:', entry.version);
        return { hit: false, status: 'MISS', latencyMs };
      }

      return {
        hit: true,
        status: 'HIT',
        entry,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      console.warn('[ExactCache] Lookup error for key:', key, err.message);
      return { hit: false, status: 'BYPASS', bypassReason: 'DB_UNAVAILABLE', latencyMs };
    }
  }

  /**
   * Stores a validated LLM response in the L1 Cache (MySQL permanent storage).
   * Only caches if:
   * 1. L1 is enabled
   * 2. Classification is 'genel' and reusable
   * 3. Response passes content safety and error checks
   */
  async store(params: {
    prompt: string;
    instructions?: string;
    format?: string;
    content: string;
    sourceProvider: string;
    sourceModel: string;
    originalUsage: {
      inputTokens: number | null;
      outputTokens: number | null;
      thinkingTokens: number | null;
      totalTokens: number | null;
    };
    classification: ClassificationDecision;
    classifierVersion?: string | null;
    confidence?: number | null;
    policyVersion?: string;
    ttlSeconds?: number;
  }): Promise<StoreResult> {
    if (!config.l1Enabled) return 'skipped';

    // Strict classification check: only 'genel' is cacheable
    if (
      params.classification.kategori !== 'genel' ||
      !params.classification.tekrar_kullanilabilir ||
      params.classification.karar_belirsiz ||
      params.classification.model_bagimliligi
    ) {
      return 'skipped';
    }

    // Validate response quality and safety
    const validation = validateResponseForCache(params.prompt, params.content);
    if (!validation.isValid) {
      console.warn('[ExactCache] Response validation failed. Skipping cache store:', validation.reason);
      return 'rejected';
    }

    const policyVersion = params.policyVersion || config.l1PolicyVersion;
    const ttlSeconds = params.ttlSeconds ?? config.l1TtlSeconds;
    const { key } = generateExactCacheKey({
      prompt: params.prompt,
      instructions: params.instructions,
      format: params.format,
      policyVersion,
    });

    const now = Date.now();
    const entry: CachedL1Entry = {
      version: policyVersion,
      key,
      prompt: params.prompt,
      content: params.content,
      sourceProvider: params.sourceProvider,
      sourceModel: params.sourceModel,
      originalUsage: params.originalUsage,
      classification: params.classification,
      createdAt: now,
      ttlSeconds,
      expiresAt: ttlSeconds > 0 ? now + ttlSeconds * 1000 : null, // null = süresiz
      classifierVersion: params.classifierVersion ?? null,
      confidence: params.confidence ?? null,
    };

    try {
      const success = await this.storage.set(entry);
      if (success) {
        // Soru metni loglanmaz (kullanıcı içeriği); sadece anahtar öneki
        console.log(`[ExactCache] Kayıt yazıldı [Key: ${key.slice(0, 25)}...] ${ttlSeconds > 0 ? `TTL=${ttlSeconds}s` : 'süresiz'}`);
      }
      return success ? 'stored' : 'failed';
    } catch (err: any) {
      console.warn('[ExactCache] Failed to store in cache storage:', err.message);
      return 'failed';
    }
  }
}

// Singleton exact cache service
export const exactCacheService = new ExactCacheService();
