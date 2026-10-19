import type { ChatApiRequest, LLMResponse } from '../../types/api.js';
import { CACHE_POLICY_VERSION, type SafetyValidationResult, type ValidationStatus } from './cacheTypes.js';

export interface CacheSafetyValidator {
  readonly version: string;
  // Sözleşme yalnızca sunucudan bağlanır; API anahtarı ve oturum kimliği doğrulayıcıya verilmez.
  validateRequest(request: Readonly<ChatApiRequest>, signal: AbortSignal): Promise<SafetyValidationResult>;
  validateResponse(request: Readonly<ChatApiRequest>, response: Readonly<LLMResponse>, signal: AbortSignal): Promise<SafetyValidationResult>;
}

export function validation(status: ValidationStatus, reasonCode: string): SafetyValidationResult {
  return { status, reasonCode, validatorVersion: CACHE_POLICY_VERSION };
}

export function inspectTextRisk(text: string): string | null {
  if (/[\p{Cf}\p{Co}]/u.test(text)) return 'ambiguous_text';
  if (/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:sk-|gsk_|AIza)[\w-]{12,}|\b\d{9,}\b|\b(?:password|passwd|secret|api[_ -]?key|şifre|parola|kimlik numarası|access token)\b)/iu.test(text)) return 'sensitive_content';
  if (/(?:ignore|disregard|override|reveal|system prompt|developer message|önceki talimat|talimatları|yok say|gizli|sızdır|jailbreak|<\/?(?:system|script)|\[INST\])/iu.test(text)) return 'unsafe_instructions';
  if (/(?:\b(?:today|now|current|latest|weather|stock price|president|ceo|live|news)\b|bugün|şu an|güncel|son dakika|hava durumu|döviz|hisse fiyat|cumhurbaşkanı|bu hafta|yarın)/iu.test(text)) return 'dynamic_information';
  if (/(?:\b(?:my|mine|your|our|benim|bana|sana|senin|ben|bizim|adım|ismim)\b|hesabım|adresim|profilim|doğum tarihim|kullanıcıya|müşteri)/iu.test(text)) return 'personal_context';
  if (/(?:\b(?:above|previous|earlier|attached|uploaded|this document)\b|yukarıdaki|önceki|az önce|yüklediğim|ekli dosya|bunu|şunu|devam et)/iu.test(text)) return 'conversation_dependent';
  return null;
}

interface StaticCategory {
  id: string;
  subject: string;
}

// Bunlar soru listeleri değil, sınırlı dilbilgisi ve alan sözlükleridir.
// Yeni kategori eklemek hem istek hem yanıt kanıtını ve politika sürümünü güncellemeyi gerektirir.
const countries = /^(?:türkiye|turkey|fransa|france|almanya|germany|italya|italy|ispanya|spain|portekiz|portugal|japonya|japan|kanada|canada|avustralya|australia|brezilya|brazil|norveç|norway|isveç|sweden|finlandiya|finland|yunanistan|greece)$/iu;
const mathTopics = /^(?:pisagor|pythagorean|öklid|euclid|thales|bayes|fermat|binom|binomial)$/iu;
const languages = /^(?:python|javascript|typescript|java|c\+\+|c#|ruby|go|rust)$/iu;

export function classifyStaticRequest(message: string): StaticCategory | null {
  // Yalnız sınıflandırma için trim yapılır. Ham metin cache anahtarında aynen kalır.
  const text = message.trim();
  if (text.length > 180 || /[\r\n]/u.test(text)) return null;
  const capital = /^(?:what is the capital of ([\p{L} ]+)\??|([\p{L} ]+?)(?:['’](?:nin|nın|nun|nün)|nin|nın|nun|nün)? başkenti(?: (?:neresidir|neresi|nedir))?[?.]?)$/iu.exec(text);
  if (capital && countries.test(capital[1] ?? capital[2])) return { id: 'geography', subject: (capital[1] ?? capital[2]).toLocaleLowerCase('tr-TR') };
  const math = /^(?:([\p{L}]+) teorem(?:i nedir|ini açıkla)[?.]?|(?:what is|explain) (?:the )?([\p{L}]+) theorem[?.]?)$/iu.exec(text);
  if (math && mathTopics.test(math[1] ?? math[2])) return { id: 'mathematics', subject: (math[1] ?? math[2]).toLowerCase() };
  const code = /^(?:([\w+#]+)(?:['’]?(?:da|de|ta|te)) (for|while) döngüsü nasıl çalışır[?.]?|how does (?:a |the )?(for|while) loop work in ([\w+#]+)[?.]?)$/iu.exec(text);
  if (code && languages.test(code[1] ?? code[4])) return { id: 'programming', subject: (code[1] ?? code[4]).toLowerCase() + ':' + (code[2] ?? code[3]).toLowerCase() };
  return null;
}

function hasStaticResponseEvidence(request: ChatApiRequest, content: string): boolean {
  const category = classifyStaticRequest(request.message);
  if (!category) return false;
  // Tam yanıt biçimi eşleşmeli: başa doğru bir cümle eklemek kalan içeriği aklamaz.
  // Bu dar kanıt semantik güvenlik sınıflandırması veya genel doğruluk denetimi değildir.
  const text = content.trim().replace(/\*\*([^*]+)\*\*/g, '$1');
  if (category.id === 'geography') {
    const match = /^(?:([\p{L} ]+)['’](?:nin|nın|nun|nün) başkenti ([\p{L} ]+?)(?:['’](?:dır|dir|dur|dür|tır|tir|tur|tür))?[.!]?|the capital of ([\p{L} ]+) is ([\p{L} ]+)[.!]?)$/iu.exec(text);
    if (!match) return false;
    const country = (match[1] ?? match[3]).toLocaleLowerCase('tr-TR');
    const city = (match[2] ?? match[4]).toLocaleLowerCase('tr-TR');
    // Küçük coğrafya sözlüğü, biçimi doğru ama başka ülkeye ait cevabın zehirlemesini de önler.
    const capitals: Record<string, string> = {
      türkiye: 'ankara', turkey: 'ankara', fransa: 'paris', france: 'paris', almanya: 'berlin', germany: 'berlin',
      italya: 'roma', italy: 'rome', ispanya: 'madrid', spain: 'madrid', portekiz: 'lizbon', portugal: 'lisbon',
      japonya: 'tokyo', japan: 'tokyo', kanada: 'ottawa', canada: 'ottawa', avustralya: 'canberra', australia: 'canberra',
      brezilya: 'brasília', brazil: 'brasília', norveç: 'oslo', norway: 'oslo', isveç: 'stockholm', sweden: 'stockholm',
      finlandiya: 'helsinki', finland: 'helsinki', yunanistan: 'atina', greece: 'athens',
    };
    return country === category.subject && capitals[country] === city;
  }
  if (category.id === 'mathematics') {
    return /^(?:pisagor|pythagorean)$/u.test(category.subject) &&
      /^(?:(?:Pisagor teoremi|Pythagorean theorem):? )?(?:(?:Dik üçgende|In a right triangle)[,:]? )?a(?:²|\^2)\s*\+\s*b(?:²|\^2)\s*=\s*c(?:²|\^2)[.!]?(?: (?:c hipotenüstür|c is the hypotenuse)[.!]?)?$/iu.test(text);
  }
  if (category.subject === 'python:for') {
    return /^(?:(?:Python['’]da for döngüsü bir dizinin elemanları üzerinde sırayla ilerler|A for loop in Python iterates over the items of a sequence)\.[\r\n ]+)?```python\r?\nfor (i|x|item) in range\(([1-9]|10)\):\r?\n {4}print\(\1\)\r?\n```$/u.test(text);
  }
  return false;
}

export async function runAdditionalValidation(validator: CacheSafetyValidator | undefined,
  phase: 'request' | 'response', request: ChatApiRequest, response?: LLMResponse,
  timeoutMs = 1000): Promise<SafetyValidationResult> {
  if (!validator) return validation('uncertain', 'additional_validator_unavailable');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Sunucu bağlamını ve sırlarını değil, sadece sağlayıcıya giden açık istek alanlarını aktarırız.
    const safeRequest: ChatApiRequest = { provider: request.provider, model: request.model, message: request.message,
      ...(request.systemInstructions === undefined ? {} : { systemInstructions: request.systemInstructions }),
      ...(request.conversation ? { conversation: structuredClone(request.conversation) } : {}),
      ...(request.generationParameters ? { generationParameters: structuredClone(request.generationParameters) } : {}),
    };
    const result = await Promise.race([
      Promise.resolve().then(() => phase === 'request' ? validator.validateRequest(safeRequest, controller.signal) :
        validator.validateResponse(safeRequest, structuredClone(response!), controller.signal)),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error('VALIDATOR_TIMEOUT'));
      }, timeoutMs); }),
    ]);
    if (!result || !['approved', 'rejected', 'uncertain'].includes(result.status) ||
      typeof result.reasonCode !== 'string' || !/^[a-z0-9_:-]{1,100}$/i.test(result.reasonCode) ||
      result.validatorVersion !== validator.version) {
      return validation('uncertain', 'invalid_validator_result');
    }
    return { status: result.status, reasonCode: result.reasonCode, validatorVersion: validator.version };
  } catch {
    return validation('uncertain', 'additional_validator_failed');
  } finally { clearTimeout(timer); }
}

export async function validateSharedResponse(request: ChatApiRequest, response: LLMResponse,
  validator?: CacheSafetyValidator, timeoutMs?: number): Promise<SafetyValidationResult> {
  if (response.cacheable !== true || !response.content.trim()) return validation('rejected', 'incomplete_provider_response');
  const safety = response.safety;
  if (!safety || [safety.complete, safety.hasToolCalls, safety.hasRetrieval, safety.hasPrivateContext, safety.flagged]
    .some(value => typeof value !== 'boolean')) return validation('uncertain', 'missing_response_safety_metadata');
  if (!safety.complete || safety.hasToolCalls || safety.hasRetrieval || safety.hasPrivateContext || safety.flagged) {
    return validation('rejected', 'unsafe_response_metadata');
  }
  const risk = inspectTextRisk(response.content);
  if (risk) return validation('rejected', 'response_' + risk);
  // İstek onayı tek başına yetmez; üretim sonrasındaki içerik ayrıca olumlu kanıt taşımalı.
  if (hasStaticResponseEvidence(request, response.content)) return validation('approved', 'static_response_evidence');
  return runAdditionalValidation(validator, 'response', request, response, timeoutMs);
}
