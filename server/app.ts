import crypto from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { openaiProvider } from './services/providers/openai.js';
import { geminiProvider } from './services/providers/gemini.js';
import { groqProvider } from './services/providers/groq.js';
import { InMemoryExactCache } from './services/cache/exactCache.js';
import { ChatService } from './services/chat/chatService.js';
import type { CacheSafetyValidator } from './services/cache/cacheValidation.js';
import { RequestValidationError, validateChatRequest } from './services/chat/requestValidation.js';
import { SessionStore } from './security/sessions.js';
import type { BrowserSession, SessionOptions } from './security/sessions.js';
import type { LLMProvider } from './types/api.js';

const defaultModels = new Map([
  ['openai', [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }, { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }]],
  ['gemini', []],
  ['groq', [{ id: 'llama3-70b-8192', name: 'Llama 3 70B' }, { id: 'llama3-8b-8192', name: 'Llama 3 8B' }, { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }]],
]);

export interface AppOptions {
  providers?: Record<string, LLMProvider>;
  allowedOrigins?: string[];
  sessions?: SessionOptions;
  cache?: InMemoryExactCache;
  providerTimeoutMs?: number;
  cacheEnabled?: boolean;
  cacheValidator?: CacheSafetyValidator;
  cachePolicyVersion?: string;
  discoverGeminiModels?: typeof discoverGeminiModels;
}

function limit(name: string, fallback: number, maximum: number): number {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new Error('Geçersiz ortam sınırı: ' + name);
  return value;
}

async function discoverGeminiModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  // Anahtar URL'ye eklenmez: proxy ve hata loglarında yanlışlıkla görünmesini engelliyoruz.
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('MODEL_DISCOVERY_FAILED');
  const data = await response.json() as { models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
  if (!Array.isArray(data.models)) throw new Error('INVALID_MODELS');
  return data.models.filter(m => {
    if (typeof m.name !== 'string' || !m.supportedGenerationMethods?.includes('generateContent')) return false;
    const id = m.name.replace('models/', '').toLowerCase();
    return !['tts', 'audio', 'speech', 'image', 'vision', 'clip', 'transcribe', 'embedding',
      'antigravity', 'deep-research', 'robotics', 'computer-use', 'omni', 'lyria', 'nano-banana', 'gemma', 'gemini-2.5']
      .some(excluded => id.includes(excluded)) && !['gemini-pro', 'gemini-1.5-pro-latest'].includes(id);
  }).slice(0, 200).map(m => ({ id: m.name!.replace('models/', '').slice(0, 200),
    name: (m.displayName || m.name!).slice(0, 200) }))
    .sort((a, b) => Number(b.id === 'gemini-3.7-flash') - Number(a.id === 'gemini-3.7-flash'));
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Forwarded başlıkları koşulsuz güvenilir değildir. HTTPS kararı yapılandırılan dış origin'den gelir.
  app.set('trust proxy', false);
  const origins = new Set(options.allowedOrigins ?? (process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : [
    'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001',
  ]));
  for (const origin of origins) {
    if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN yalnızca tam origin olmalıdır.');
  }
  const secure = [...origins].some(origin => origin.startsWith('https:'));
  if (process.env.NODE_ENV === 'production' && (!secure || [...origins].some(origin => !origin.startsWith('https:')))) {
    throw new Error('Üretimde HTTPS APP_ORIGIN gereklidir.');
  }
  const sessions = new SessionStore({
    ttlMs: limit('SESSION_TTL_MS', 8 * 60 * 60 * 1000, 24 * 60 * 60 * 1000),
    maxSessions: limit('SESSION_MAX_ENTRIES', 1000, 10_000), ...options.sessions,
    secure: secure || options.sessions?.secure,
  });
  const cache = options.cache ?? new InMemoryExactCache({
    ttlMs: limit('L1_CACHE_TTL_MS', 30 * 60 * 1000, 24 * 60 * 60 * 1000),
    maxEntries: limit('L1_CACHE_MAX_ENTRIES', 500, 100_000),
    maxSharedEntries: limit('L1_CACHE_MAX_SHARED_ENTRIES', 250, 100_000),
    maxPrivateEntries: limit('L1_CACHE_MAX_PRIVATE_ENTRIES', 250, 100_000),
    maxEntryBytes: limit('L1_CACHE_MAX_ENTRY_BYTES', 256 * 1024, 2 * 1024 * 1024),
    maxTotalBytes: limit('L1_CACHE_MAX_TOTAL_BYTES', 16 * 1024 * 1024, 256 * 1024 * 1024),
  });
  const providers = options.providers ?? { openai: openaiProvider, gemini: geminiProvider, groq: groqProvider };
  const chatService = new ChatService({ providers, cache, cacheTtlMs: cache.ttlMs,
    // Burada varsayılan olarak ücretli veya semantik bir doğrulayıcı başlatılmaz.
    validator: options.cacheValidator, policyVersion: options.cachePolicyVersion,
    validatorTimeoutMs: limit('CACHE_VALIDATOR_TIMEOUT_MS', 1000, 30_000),
    providerTimeoutMs: options.providerTimeoutMs ?? limit('PROVIDER_TIMEOUT_MS', 60_000, 300_000),
    maxConcurrentGenerations: limit('L1_MAX_CONCURRENT_GENERATIONS', 100, 1000),
    maxWaitersPerKey: limit('L1_MAX_WAITERS_PER_KEY', 32, 1000),
    cacheEnabled: options.cacheEnabled ?? process.env.L1_CACHE_ENABLED !== 'false',
  });

  app.use('/api', (req, res, next) => {
    const requestId = crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    // SameSite tek başına yeterli değil: kardeş origin ve basit form POST'ları da engellenir.
    if ((origin && !origins.has(origin)) || req.get('sec-fetch-site') === 'cross-site') {
      res.status(403).json({ error: 'İstek kaynağına izin verilmiyor.', requestId }); return;
    }
    if (req.method !== 'GET' && (req.get('X-TokenAI-Request') !== '1' || !req.is('application/json'))) {
      res.status(403).json({ error: 'JSON ve uygulama istek başlığı gereklidir.', requestId }); return;
    }
    // Açık CORS yok; tarayıcı API'ye Vite/üretim aynı-origin proxy üzerinden ulaşır.
    const session = sessions.resolve(req, res);
    if (!session) { res.status(503).json({ error: 'Oturum kapasitesi dolu.', requestId }); return; }
    res.locals.session = session;
    next();
  });
  app.use(express.json({ limit: '128kb', strict: true }));

  app.get('/api/providers', (_req, res) => {
    const session = res.locals.session as BrowserSession;
    res.json({ providers: Object.keys(providers).map(id => ({ id,
      name: id === 'openai' ? 'OpenAI' : id === 'gemini' ? 'Google Gemini' : 'Groq',
      configured: session.apiKeys.has(id), models: session.models.get(id) ?? defaultModels.get(id) ?? [],
    })) });
  });

  app.post('/api/providers/:provider/configure', async (req, res) => {
    const provider = String(req.params.provider);
    const body = req.body as unknown;
    const requestId = res.locals.requestId as string;
    if (!Object.hasOwn(providers, provider) || !body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key => key !== 'apiKey') || !('apiKey' in body) ||
        typeof body.apiKey !== 'string' || !body.apiKey.trim() || body.apiKey.length > 8192) {
      res.status(400).json({ error: 'Sağlayıcı veya API anahtarı geçersiz.', requestId }); return;
    }
    const session = res.locals.session as BrowserSession;
    const cleanKey = body.apiKey.trim();
    if (provider === 'gemini') {
      try {
        const models = await (options.discoverGeminiModels ?? discoverGeminiModels)(cleanKey);
        if (models.length === 0) throw new Error('NO_MODELS');
        session.models.set(provider, models);
      } catch {
        res.status(400).json({ error: 'API anahtarı geçersiz veya Gemini API erişimi bulunmuyor.', requestId }); return;
      }
    }
    session.apiKeys.set(provider, cleanKey);
    // Anahtar değişince eski özel cache/üretime bağlanılmaz; onaylı ortak kayıt kimlikten bağımsızdır.
    session.credentialRevision++;
    res.json({ success: true, configured: true });
  });

  app.post('/api/chat', async (req, res) => {
    const requestId = res.locals.requestId as string;
    try {
      const request = validateChatRequest(req.body);
      const session = res.locals.session as BrowserSession;
      const apiKey = session.apiKeys.get(request.provider);
      if (!apiKey) {
        res.status(400).json({ error: 'Önce Ayarlar > API bölümünden bu oturum için bir API sağlayıcısı yapılandır.', requestId }); return;
      }
      const payload = await chatService.execute(request, { apiKey, requestId,
        securityScope: { partitionId: session.partitionId, credentialRevision: session.credentialRevision },
      });
      res.json(payload);
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : '';
      const providerUnavailable = error !== null && typeof error === 'object' && 'status' in error &&
        (error.status === 503 || error.status === 429);
      const status = error instanceof RequestValidationError ? 400 : code === 'PROVIDER_TIMEOUT' ? 504 :
        code === 'CAPACITY_EXCEEDED' || providerUnavailable ? 503 : 502;
      // Ham sağlayıcı hataları anahtar veya istek içeriği taşıyabilir; dışarıya kontrollü hata veririz.
      const message = status === 400 ? code : status === 504 ? 'Sağlayıcı yanıt süresi aşıldı.' :
        providerUnavailable ? 'Bu model şu anda yoğun. Biraz sonra tekrar deneyebilir veya başka bir model seçebilirsin.' :
          status === 503 ? 'İstek kapasitesi dolu. Biraz sonra tekrar deneyebilirsin.' : 'Yanıt alınamadı. Lütfen API ayarlarını kontrol et.';
      res.status(status).json({ error: message, requestId });
    }
  });
  const errorHandler: ErrorRequestHandler = (error: { type?: string }, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400)
      .json({ error: 'Geçerli boyutta JSON istek gövdesi gereklidir.', requestId: res.locals.requestId });
  };
  app.use(errorHandler);
  return { app, cache, sessions, chatService, close: () => { sessions.dispose(); cache.clear(); } };
}
