import crypto from 'node:crypto';
import { CACHE_SCHEMA_VERSION, type ExactCacheKeyInput } from './cacheTypes.js';

export function stableSerialize(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' ||
      (typeof value === 'number' && !Number.isFinite(value))) throw new Error('INVALID_CANONICAL_VALUE');
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(record)) ||
      Object.keys(record).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) {
    throw new Error('INVALID_CANONICAL_OBJECT');
  }
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export function createExactCacheKey(input: Omit<ExactCacheKeyInput, 'schemaVersion'>): string {
  // Sağlayıcı, ham model kimliği, kapsam ve tüm desteklenen bağlam anahtara girer.
  // Böylece L1, farklı model veya kullanıcı yanıtlarını asla birbiriyle karıştırmaz.
  const canonical: ExactCacheKeyInput = {
    ...input,
    schemaVersion: CACHE_SCHEMA_VERSION,
  };

  return crypto.createHash('sha256').update(stableSerialize(canonical), 'utf8').digest('hex');
}
