import crypto from 'node:crypto';
import { stableSerialize } from './cacheKey.js';
import type { CachePolicyDecision, ExactCacheKeyInput } from './cacheTypes.js';

export interface CachePolicyRequest extends Omit<ExactCacheKeyInput, 'schemaVersion'> {
  forceCacheBypass?: boolean;
}

// Güven sınırı sunucu kodudur: istemciden kategori/cacheSafe bayrağı kabul etmiyoruz.
// Bu dar liste zamandan bağımsız eğitim sorularıdır; genel serbest metni sınıflandırmaz.
export const REVIEWED_STATIC_PROMPTS = [
  'İkili arama algoritmasını açıkla.',
  'Pisagor teoremini açıkla.',
  'Explain the binary search algorithm.',
] as const;

export function cacheSafetyFingerprint(request: Pick<CachePolicyRequest,
  'message' | 'systemInstructions' | 'conversation' | 'generationParameters'>): string {
  return crypto.createHash('sha256').update(stableSerialize({
    message: request.message, systemInstructions: request.systemInstructions,
    conversation: request.conversation, generationParameters: request.generationParameters,
  })).digest('hex');
}

export const DEFAULT_SAFE_FINGERPRINTS: ReadonlySet<string> = new Set(REVIEWED_STATIC_PROMPTS.map(message =>
  cacheSafetyFingerprint({ message, systemInstructions: null, conversation: [], generationParameters: {} })));

export function evaluateCachePolicy(request: CachePolicyRequest, approved: ReadonlySet<string> = DEFAULT_SAFE_FINGERPRINTS): CachePolicyDecision {
  if (request.forceCacheBypass) return { eligible: false, reason: 'explicit_bypass' };
  if (!request.securityScope.partitionId) return { eligible: false, reason: 'missing_verified_session' };
  if (request.toolContext || request.retrievalContext) return { eligible: false, reason: 'unsupported_external_context' };
  // Anahtar eşleşmesi uygunluk kanıtı değildir. Önce tüm içerik/parametre birleşimi onaylı olmalı.
  if (!approved.has(cacheSafetyFingerprint(request))) return { eligible: false, reason: 'untrusted_request' };
  return { eligible: true, reason: null };
}
