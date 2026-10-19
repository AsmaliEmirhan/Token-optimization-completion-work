import type { ChatApiRequest, LLMResponse } from '../../types/api.js';
import { CACHE_POLICY_VERSION, type ClassificationOverhead, type PrivacyClassification,
  type SafetyValidationResult, type ValidationStatus } from './cacheTypes.js';

export interface SemanticClassificationResult {
  classification: PrivacyClassification;
  confidence: number;
  reasonCode: string;
  classifierVersion: string;
  // Sınıflandırıcı kendi çağrısını ölçer; kullanıcı sağlayıcısının anahtarı bu arayüze verilmez.
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number };
}

export interface SemanticPrivacyClassifier {
  readonly version: string;
  classifyRequest(request: Readonly<ChatApiRequest>, signal: AbortSignal): Promise<SemanticClassificationResult>;
  classifyResponse(request: Readonly<ChatApiRequest>, response: Readonly<LLMResponse>,
    signal: AbortSignal): Promise<SemanticClassificationResult>;
}

export interface PrivacyDecision {
  classification: PrivacyClassification;
  confidence: number | null;
  reasonCode: string;
  classifierVersion: string;
}

export function validation(status: ValidationStatus, reasonCode: string,
  validatorVersion = CACHE_POLICY_VERSION): SafetyValidationResult {
  return { status, reasonCode, validatorVersion };
}

export function createClassificationOverhead(): ClassificationOverhead {
  return { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, latencyMs: 0 };
}

// Bu kurallar yalnızca olumsuz/şüpheli işaret bulur. Eşleşmemesi "kamusal" kanıtı değildir.
export function inspectTextRisk(text: string): PrivacyDecision | null {
  const decide = (classification: PrivacyClassification, reasonCode: string): PrivacyDecision => ({
    classification, confidence: 1, reasonCode, classifierVersion: CACHE_POLICY_VERSION,
  });
  if (/[\p{Cf}\p{Co}]/u.test(text)) return decide('uncertain', 'ambiguous_text');
  if (/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:sk-|gsk_|AIza)[\w-]{12,}|\b\d{9,}\b|\b(?:password|passwd|secret|api[_ -]?key|şifre|parola|kimlik numarası|access token)\b)/iu.test(text))
    return decide('sensitive', 'sensitive_content');
  if (/(?:ignore|disregard|override|reveal|system prompt|developer message|önceki talimat|talimatları|yok say|gizli|sızdır|jailbreak|<\/?(?:system|script)|\[INST\])/iu.test(text))
    return decide('uncertain', 'unsafe_instructions');
  if (/(?:\b(?:today|now|current|latest|weather|stock price|president|ceo|live|news)\b|bugün|şu an|güncel|son dakika|hava durumu|döviz|hisse fiyat|cumhurbaşkanı|bu hafta|yarın)/iu.test(text))
    return decide('dynamic', 'dynamic_information');
  if (/(?:\b(?:my|mine|your|our|benim|bana|sana|senin|ben|bizim|adım|ismim)\b|hesabım|adresim|profilim|doğum tarihim|kullanıcıya|müşteri)/iu.test(text))
    return decide('session_private', 'personal_context');
  if (/(?:\b(?:above|previous|earlier|attached|uploaded|this document)\b|yukarıdaki|önceki|az önce|yüklediğim|ekli dosya|bunu|şunu|devam et)/iu.test(text))
    return decide('session_private', 'conversation_dependent');
  return null;
}

export async function runSemanticClassification(classifier: SemanticPrivacyClassifier | undefined,
  phase: 'request' | 'response', request: ChatApiRequest, overhead: ClassificationOverhead,
  response?: LLMResponse, timeoutMs = 1000): Promise<PrivacyDecision> {
  const uncertain = (reasonCode: string): PrivacyDecision => ({ classification: 'uncertain', confidence: null,
    reasonCode, classifierVersion: classifier?.version ?? CACHE_POLICY_VERSION });
  if (!classifier) return uncertain('semantic_classifier_unavailable');
  const controller = new AbortController();
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  overhead.calls++;
  try {
    // Güvenilen uygulama yapılandırması dışında kimlik, çerez veya API anahtarı aktarılmaz.
    const safeRequest: ChatApiRequest = { provider: request.provider, model: request.model, message: request.message,
      ...(request.systemInstructions === undefined ? {} : { systemInstructions: request.systemInstructions }),
      ...(request.conversation ? { conversation: structuredClone(request.conversation) } : {}),
      ...(request.generationParameters ? { generationParameters: structuredClone(request.generationParameters) } : {}),
    };
    const result = await Promise.race([
      Promise.resolve().then(() => phase === 'request' ? classifier.classifyRequest(safeRequest, controller.signal) :
        classifier.classifyResponse(safeRequest, structuredClone(response!), controller.signal)),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error('CLASSIFIER_TIMEOUT'));
      }, timeoutMs); }),
    ]);
    const validCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
    const usage = result?.usage;
    if (!result || !['public_shareable', 'user_private', 'session_private', 'sensitive', 'dynamic', 'uncertain']
      .includes(result.classification) || !Number.isFinite(result.confidence) || result.confidence < 0 ||
      result.confidence > 1 || !/^[a-z0-9_:-]{1,100}$/i.test(result.reasonCode) ||
      result.classifierVersion !== classifier.version || !usage || !validCount(usage.inputTokens) ||
      !validCount(usage.outputTokens) || !validCount(usage.totalTokens) ||
      usage.totalTokens < usage.inputTokens + usage.outputTokens ||
      !Number.isFinite(usage.estimatedCost) || usage.estimatedCost < 0) {
      overhead.inputTokens = overhead.outputTokens = overhead.totalTokens = overhead.estimatedCost = null;
      return uncertain('invalid_classifier_result');
    }
    if (overhead.inputTokens !== null) overhead.inputTokens += usage.inputTokens;
    if (overhead.outputTokens !== null) overhead.outputTokens += usage.outputTokens;
    if (overhead.totalTokens !== null) overhead.totalTokens += usage.totalTokens;
    if (overhead.estimatedCost !== null) overhead.estimatedCost += usage.estimatedCost;
    // Güven eşiği nicel garanti değildir; düşük güven kamusal paylaşıma yetmez.
    if (result.classification === 'public_shareable' && result.confidence < 0.95) return uncertain('classifier_low_confidence');
    // Serbest neden metni telemetriye taşınmaz; istemci içeriği kodlara gizlenemez.
    return { classification: result.classification, confidence: result.confidence,
      reasonCode: 'classifier_' + result.classification, classifierVersion: result.classifierVersion };
  } catch {
    overhead.inputTokens = overhead.outputTokens = overhead.totalTokens = overhead.estimatedCost = null;
    return uncertain('semantic_classifier_failed');
  } finally {
    clearTimeout(timer);
    overhead.latencyMs += Math.max(0, Math.round(performance.now() - started));
  }
}

export async function validateSharedResponse(request: ChatApiRequest, response: LLMResponse,
  classifier: SemanticPrivacyClassifier | undefined, overhead: ClassificationOverhead,
  timeoutMs?: number): Promise<SafetyValidationResult> {
  if (response.cacheable !== true || !response.content.trim()) return {
    ...validation('rejected', 'incomplete_provider_response'), classification: 'uncertain' };
  const safety = response.safety;
  if (!safety || [safety.complete, safety.hasToolCalls, safety.hasRetrieval, safety.hasPrivateContext, safety.flagged]
    .some(value => typeof value !== 'boolean')) return {
      ...validation('uncertain', 'missing_response_safety_metadata'), classification: 'uncertain' };
  if (!safety.complete || safety.hasToolCalls || safety.hasRetrieval || safety.hasPrivateContext || safety.flagged)
    return { ...validation('rejected', 'unsafe_response_metadata'), classification: 'uncertain' };
  const risk = inspectTextRisk(response.content);
  if (risk) return { ...validation('rejected', 'response_' + risk.reasonCode), classification: risk.classification };
  const decision = await runSemanticClassification(classifier, 'response', request, overhead, response, timeoutMs);
  return { ...validation(decision.classification === 'public_shareable' ? 'approved' :
    decision.classification === 'uncertain' ? 'uncertain' : 'rejected', decision.reasonCode, decision.classifierVersion),
    classification: decision.classification, confidence: decision.confidence };
}
