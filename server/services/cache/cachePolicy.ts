import type { CachePolicyDecision, ExactCacheKeyInput } from './cacheTypes.js';

export interface CachePolicyRequest extends Omit<ExactCacheKeyInput, 'schemaVersion'> {
  stream?: boolean;
  hasExternalSideEffects?: boolean;
  forceCacheBypass?: boolean;
}

// Bu liste yalnızca açıkça zamana duyarlı istekleri engelleyen ek bir koruma katmanıdır;
// semantik doğrulama değildir ve tek başına eksiksiz bir güvenlik mekanizması sayılmaz.
const DYNAMIC_PATTERNS = [
  /\b(today|now|current|latest|breaking|live|weather|forecast|news|stock|share price|exchange rate|score)\b/i,
  /\b(bugün|şimdi|güncel|son dakika|canlı|hava durumu|haber|borsa|hisse|döviz|kur|skor)\b/i,
];

function hasSecurityScope(scope: CachePolicyRequest['securityScope']): boolean {
  return [scope.tenantId, scope.userId, scope.sessionId].some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
}

export function evaluateCachePolicy(request: CachePolicyRequest): CachePolicyDecision {
  if (request.forceCacheBypass) return { eligible: false, reason: 'explicit_bypass' };
  if (request.stream) return { eligible: false, reason: 'streaming' };
  if (request.hasExternalSideEffects) return { eligible: false, reason: 'external_side_effects' };
  if (!hasSecurityScope(request.securityScope)) return { eligible: false, reason: 'missing_security_scope' };

  if (request.toolContext && (!request.toolContext.cacheSafe || !request.toolContext.fingerprint)) {
    return { eligible: false, reason: 'unstable_tool_context' };
  }
  if (request.retrievalContext && (!request.retrievalContext.cacheSafe || !request.retrievalContext.fingerprint)) {
    return { eligible: false, reason: 'unstable_retrieval_context' };
  }

  const combinedText = [request.systemInstructions ?? '', ...request.conversation.map((item) => item.content), request.message].join('\n');
  if (DYNAMIC_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    // Güncellik gerektiren isteklerde eski bir yanıtı tekrar sunmak yerine normal LLM yolunu kullanıyoruz.
    return { eligible: false, reason: 'potentially_dynamic_content' };
  }

  return { eligible: true, reason: null };
}
