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
  if (input.scope === 'shared' ? input.scopeId !== null : !input.scopeId) throw new Error('INVALID_CACHE_SCOPE');
  const fingerprint = (value: unknown) => crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
  // Ham prompt korunur; sınıflandırmada kullanılan sadeleştirme L1 anahtarına uygulanmaz.
  // Açık alan seçimi API anahtarı/oturum sırrının yanlışlıkla anahtara taşınmasını önler.
  const canonical = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    scope: input.scope, scopeId: input.scopeId, policyVersion: input.policyVersion,
    provider: input.provider, model: input.model, message: input.message,
    systemFingerprint: fingerprint(input.systemInstructions),
    conversationFingerprint: fingerprint(input.conversation),
    generationParameters: input.generationParameters,
    toolContext: input.toolContext, retrievalContext: input.retrievalContext,
  };

  return crypto.createHash('sha256').update(stableSerialize(canonical), 'utf8').digest('hex');
}
