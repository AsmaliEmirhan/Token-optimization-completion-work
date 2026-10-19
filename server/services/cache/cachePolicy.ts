import crypto from 'node:crypto';
import { stableSerialize } from './cacheKey.js';
import { CACHE_POLICY_VERSION, type AuthenticatedIdentity, type CacheScopeBinding,
  type CacheScopeDecision, type SecurityScope } from './cacheTypes.js';
import type { ChatApiRequest } from '../../types/api.js';
import { classifyStaticRequest, inspectTextRisk, validation, type CacheSafetyValidator,
  runAdditionalValidation } from './cacheValidation.js';

export interface CachePolicyRequest extends ChatApiRequest {
  securityScope?: SecurityScope;
  authenticatedIdentity?: AuthenticatedIdentity;
}

export function privateScopeFor(request: CachePolicyRequest): CacheScopeBinding {
  const identity = request.authenticatedIdentity;
  // Sohbet geçmişi kullanıcı hesabından daha dar olan oturumda kalır.
  const user = identity?.authenticated === true && identity.issuer && identity.subject &&
    Number.isSafeInteger(identity.cacheRevision) && identity.cacheRevision >= 0 && !request.conversation?.length;
  const value = user ? { issuer: identity.issuer, subject: identity.subject, revision: identity.cacheRevision } : request.securityScope;
  return { scope: user ? 'user_private' : 'session_private',
    scopeId: crypto.createHash('sha256').update(stableSerialize(value ?? null)).digest('hex') };
}

export async function evaluateCachePolicy(request: CachePolicyRequest, options: {
  policyVersion?: string; validator?: CacheSafetyValidator; validatorTimeoutMs?: number;
} = {}): Promise<CacheScopeDecision> {
  const policyVersion = options.policyVersion ?? CACHE_POLICY_VERSION;
  const privateScope = privateScopeFor(request).scope;
  const decide = (scope: CacheScopeDecision['scope'], reasonCode: string,
    status: 'approved' | 'rejected' | 'uncertain', additional = false, category: string | null = null): CacheScopeDecision => ({
    scope, eligible: scope !== null, reasonCode, policyVersion,
    requiresAdditionalValidation: additional, category, sharing: validation(status, reasonCode),
  });
  if (request.forceCacheBypass) return decide(null, 'explicit_bypass', 'rejected');
  if (!request.securityScope?.partitionId || !Number.isSafeInteger(request.securityScope.credentialRevision) ||
      request.securityScope.credentialRevision < 0) return decide(null, 'missing_verified_session', 'rejected');
  if (request.toolContext || request.retrievalContext || request.hasExternalSideEffects || request.stream) {
    return decide(null, 'unsupported_external_context', 'rejected');
  }
  const fullText = [request.message, request.systemInstructions ?? '', ...(request.conversation ?? []).map(m => m.content)].join('\n');
  const risk = inspectTextRisk(fullText);
  if (risk && risk !== 'personal_context' && risk !== 'conversation_dependent') return decide(null, risk, 'rejected');
  if (request.conversation?.some(m => !m.content.trim())) return decide(null, 'incomplete_context', 'rejected');
  // Gizli/özel sistem talimatı ve önceki konuşma asla ortak kapsama yükseltilmez.
  if (request.systemInstructions !== undefined) return decide(privateScope, 'custom_system_instructions', 'rejected');
  if (request.conversation?.length) return decide(privateScope, 'conversation_context', 'rejected');
  if (risk) return decide(privateScope, risk, 'rejected');
  if (Object.keys(request.generationParameters ?? {}).length) return decide(privateScope, 'custom_generation_parameters', 'rejected');

  const category = classifyStaticRequest(request.message);
  if (category) return decide('shared', 'static_' + category.id, 'approved', false, category.id);

  // Şüpheli sözcük bulunmaması olumlu kanıt değildir. Ek doğrulayıcı yoksa belirsiz istek özeldir.
  const sharing = await runAdditionalValidation(options.validator, 'request', request, undefined, options.validatorTimeoutMs);
  return { ...decide(sharing.status === 'approved' ? 'shared' : privateScope,
    sharing.reasonCode, sharing.status, true), sharing };
}
