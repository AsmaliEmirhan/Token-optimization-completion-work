import crypto from 'node:crypto';
import { stableSerialize } from './cacheKey.js';
import { CACHE_POLICY_VERSION, type AuthenticatedIdentity, type CacheScopeBinding,
  type CacheScopeDecision, type ClassificationOverhead, type PrivacyClassification,
  type SecurityScope } from './cacheTypes.js';
import type { ChatApiRequest } from '../../types/api.js';
import { inspectTextRisk, runSemanticClassification, validation,
  type PrivacyDecision, type SemanticPrivacyClassifier } from './cacheValidation.js';

export interface CachePolicyRequest extends ChatApiRequest {
  securityScope?: SecurityScope;
  authenticatedIdentity?: AuthenticatedIdentity;
}

// Gelecekteki auth analitiğinin kapsam sözleşmesi; mevcut politika özel kayıt yazmaz.
export function privateScopeFor(request: CachePolicyRequest): CacheScopeBinding {
  const identity = request.authenticatedIdentity;
  const user = identity?.authenticated === true && identity.issuer && identity.subject &&
    Number.isSafeInteger(identity.cacheRevision) && identity.cacheRevision >= 0 && !request.conversation?.length;
  const value = user ? { issuer: identity.issuer, subject: identity.subject, revision: identity.cacheRevision } : request.securityScope;
  return { scope: user ? 'user_private' : 'session_private',
    scopeId: crypto.createHash('sha256').update(stableSerialize(value ?? null)).digest('hex') };
}

export async function evaluateCachePolicy(request: CachePolicyRequest, options: {
  policyVersion?: string;
  classifier?: SemanticPrivacyClassifier;
  classifierTimeoutMs?: number;
  overhead: ClassificationOverhead;
}): Promise<CacheScopeDecision> {
  const policyVersion = options.policyVersion ?? CACHE_POLICY_VERSION;
  const decide = (decision: PrivacyDecision): CacheScopeDecision => {
    const eligible = decision.classification === 'public_shareable';
    return { scope: eligible ? 'shared' : null, eligible, reasonCode: decision.reasonCode, policyVersion,
      requiresAdditionalValidation: true, category: null,
      sharing: validation(eligible ? 'approved' : decision.classification === 'uncertain' ? 'uncertain' : 'rejected',
        decision.reasonCode, decision.classifierVersion),
      classification: decision.classification, confidence: decision.confidence,
      classificationOverhead: { ...options.overhead },
    };
  };
  const structural = (classification: PrivacyClassification, reasonCode: string): CacheScopeDecision =>
    decide({ classification, confidence: 1, reasonCode, classifierVersion: CACHE_POLICY_VERSION });
  if (request.forceCacheBypass) return structural('uncertain', 'explicit_bypass');
  if (!request.securityScope?.partitionId || !Number.isSafeInteger(request.securityScope.credentialRevision) ||
      request.securityScope.credentialRevision < 0) return structural('uncertain', 'missing_verified_session');
  if (request.toolContext || request.retrievalContext || 'uploadedFiles' in request ||
      request.hasExternalSideEffects || request.stream) return structural('session_private', 'external_context');
  const risk = inspectTextRisk([request.message, request.systemInstructions ?? '',
    ...(request.conversation ?? []).map(item => item.content)].join('\n'));
  if (risk) return decide(risk);
  if (request.conversation?.some(item => !item.content.trim())) return structural('uncertain', 'incomplete_context');
  if (request.conversation?.length) return structural('session_private', 'conversation_context');
  if (request.systemInstructions !== undefined) return structural('session_private', 'custom_system_instructions');
  if (request.authenticatedIdentity) return structural('user_private', 'authenticated_context');
  // Yokluk kanıt değildir. Kamusal paylaşım için güvenilir, açıkça etkinleştirilmiş sınıflandırıcı gerekir.
  return decide(await runSemanticClassification(options.classifier, 'request', request,
    options.overhead, undefined, options.classifierTimeoutMs));
}
