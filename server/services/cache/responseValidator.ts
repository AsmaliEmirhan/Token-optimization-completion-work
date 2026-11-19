export interface ResponseValidationResult {
  isValid: boolean;
  reason?: string;
}

// Regex patterns for detecting accidental leakage of API keys or sensitive session secrets
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/i,               // OpenAI style key
  /AIza[0-9A-Za-z-_]{35}/i,              // Google API key
  /gsk_[a-zA-Z0-9_-]{20,}/i,             // Groq API key
  /Bearer\s+[a-zA-Z0-9_\-\.]{25,}/i,     // Bearer tokens
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // UUID (session IDs)
];

// Refusal or transient error indicators in Turkish and English
const ERROR_OR_REFUSAL_INDICATORS = [
  'hata oluştu',
  'api anahtarı geçersiz',
  'rate limit exceeded',
  'too many requests',
  'service unavailable',
  'model şu anda yoğun',
  '503 service',
  'unauthorized',
  'invalid api key',
  'internal server error',
  'bağlantı hatası',
];

/**
 * Validates that an LLM response is safe, non-empty, error-free, and reusable
 * before allowing it to be stored in the shared L1 exact match cache.
 */
export function validateResponseForCache(prompt: string, content: string): ResponseValidationResult {
  if (!content || typeof content !== 'string') {
    return { isValid: false, reason: 'Yanıt boş veya metin değil.' };
  }

  const trimmed = content.trim();
  if (trimmed.length < 5) {
    return { isValid: false, reason: 'Yanıt çok kısa veya içeriksiz.' };
  }

  // Check for sensitive credential leaks
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isValid: false, reason: 'Yanıtta hassas veri veya API anahtarı sızıntısı şüphesi tespit edildi.' };
    }
  }

  // Check for error or failure messages masquerading as assistant content
  const lower = trimmed.toLowerCase();
  for (const indicator of ERROR_OR_REFUSAL_INDICATORS) {
    if (lower.includes(indicator) && trimmed.length < 200) {
      return { isValid: false, reason: `Yanıt hata veya servis kesintisi içeriyor: "${indicator}"` };
    }
  }

  return { isValid: true };
}
