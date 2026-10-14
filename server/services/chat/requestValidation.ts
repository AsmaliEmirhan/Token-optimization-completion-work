import type { ChatApiRequest } from '../../types/api.js';

export class RequestValidationError extends Error {}

function fail(field: string): never {
  throw new RequestValidationError(`Geçersiz veya desteklenmeyen istek alanı: ${field}`);
}

function record(value: unknown, allowed: string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(field);
  // Sadece kendi veri alanlarını kabul ediyoruz; prototip ve erişimci tuzakları sözleşmeye dahil değil.
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key) ||
        !('value' in Object.getOwnPropertyDescriptor(value, key)!)) fail(field);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, field: string, empty = false): void {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(field);
}

export function validateChatRequest(input: unknown): ChatApiRequest {
  const r = record(input, ['provider', 'model', 'message', 'systemInstructions', 'conversation',
    'generationParameters', 'securityScope', 'toolContext', 'retrievalContext', 'stream',
    'hasExternalSideEffects', 'forceCacheBypass'], 'body');
  if (!['openai', 'gemini', 'groq'].includes(r.provider as string)) fail('provider');
  text(r.model, 200, 'model');
  text(r.message, 32_000, 'message');
  if (r.systemInstructions !== undefined) text(r.systemInstructions, 16_000, 'systemInstructions', true);
  if (r.conversation !== undefined) {
    if (!Array.isArray(r.conversation) || r.conversation.length > 100) fail('conversation');
    for (const item of r.conversation) {
      const m = record(item, ['role', 'content'], 'conversation');
      if (m.role !== 'user' && m.role !== 'assistant') fail('role');
      text(m.content, 32_000, 'content', true);
    }
  }
  if (r.generationParameters !== undefined) {
    const p = record(r.generationParameters, ['temperature', 'topP', 'maxOutputTokens', 'stopSequences', 'seed'], 'generationParameters');
    for (const [key, max] of [['temperature', 2], ['topP', 1], ['maxOutputTokens', 32768], ['seed', 2147483647]] as const) {
      const value = p[key];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail(key);
      if ((key === 'maxOutputTokens' || key === 'seed') && !Number.isInteger(value)) fail(key);
      if (key === 'maxOutputTokens' && value === 0) fail(key);
    }
    // Gemini adaptörü seed uygulamadığı için sessizce yok saymak yerine reddediyoruz.
    if (r.provider === 'gemini' && p.seed !== undefined) fail('seed');
    if (p.stopSequences !== undefined) {
      if (!Array.isArray(p.stopSequences) || p.stopSequences.length > 4) fail('stopSequences');
      for (const stop of p.stopSequences) text(stop, 200, 'stopSequences');
    }
  }
  for (const key of ['stream', 'hasExternalSideEffects', 'forceCacheBypass']) {
    if (r[key] !== undefined && typeof r[key] !== 'boolean') fail(key);
  }
  // Bu endpoint streaming veya harici işlem yürütmez; destekleniyormuş gibi cevap vermiyoruz.
  if (r.stream === true || r.hasExternalSideEffects === true) fail('stream/hasExternalSideEffects');
  for (const key of ['toolContext', 'retrievalContext']) {
    if (r[key] != null) {
      const context = record(r[key], ['cacheSafe', 'fingerprint'], key);
      if (typeof context.cacheSafe !== 'boolean') fail(key);
      text(context.fingerprint, 256, key);
      fail(key); // Parmak izi tek başına araç/retrieval sonucunu sağlayıcıya taşımaz.
    }
  }
  if (r.securityScope !== undefined) {
    const scope = record(r.securityScope, ['sessionId', 'userId', 'tenantId'], 'securityScope');
    for (const value of Object.values(scope)) text(value, 256, 'securityScope');
  }
  // Eski istemcinin kimlik iddiaları doğrulanmaz ve iç sözleşmeye kesinlikle aktarılmaz.
  const { securityScope: _untrustedScope, ...validated } = r;
  if (Buffer.byteLength(JSON.stringify(validated), 'utf8') > 128 * 1024) fail('body size');
  return structuredClone(validated) as unknown as ChatApiRequest;
}
