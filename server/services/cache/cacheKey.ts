import crypto from 'node:crypto';
import { CACHE_SCHEMA_VERSION, type ExactCacheKeyInput } from './cacheTypes.js';

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export function createExactCacheKey(input: Omit<ExactCacheKeyInput, 'schemaVersion'>): string {
  // Sağlayıcı, ham model kimliği, kapsam ve tüm desteklenen bağlam anahtara girer.
  // Böylece L1, farklı model veya kullanıcı yanıtlarını asla birbiriyle karıştırmaz.
  const canonical: ExactCacheKeyInput = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    ...input,
  };

  return crypto.createHash('sha256').update(stableSerialize(canonical), 'utf8').digest('hex');
}
