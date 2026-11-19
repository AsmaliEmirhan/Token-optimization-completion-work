import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { openaiProvider } from './services/providers/openai.js';
import { geminiProvider } from './services/providers/gemini.js';
import { groqProvider } from './services/providers/groq.js';
import { calculateRequestCost } from './services/cost/costEngine.js';
import { calculateAvoidedCost } from './services/cost/avoidedCost.js';
import { exactCacheService } from './services/cache/exactCache.js';
import { mysqlStorageService } from './services/cache/mysqlClient.js';
import { berturkClassifier } from './services/classifier/berturkClassifier.js';
import { decideCacheability, type BypassReason } from './services/classifier/l1Decision.js';
import { sessionManager } from './services/chat/sessionManager.js';
import type { LLMProvider, RequestTelemetry, ChatApiResponse } from './types/api.js';

export const app = express();
app.use(cors());
app.use(express.json());

export const providers: Record<string, LLMProvider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  groq: groqProvider,
};

// Available models per provider
export const providerModels: Record<string, { id: string; name: string }[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  ],
  gemini: [],
  groq: [
    { id: 'llama3-70b-8192', name: 'Llama 3 70B' },
    { id: 'llama3-8b-8192', name: 'Llama 3 8B' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
  ],
};

app.get('/api/providers', (req, res) => {
  const sessionId = sessionManager.resolveSessionId(req.headers['x-session-id']);
  const result = Object.keys(providers).map(id => ({
    id,
    name: id === 'openai' ? 'OpenAI' : id === 'gemini' ? 'Google Gemini' : 'Groq',
    configured: sessionManager.hasApiKey(sessionId, id),
    models: providerModels[id] || []
  }));
  res.json({ providers: result });
});

app.post('/api/providers/:provider/configure', async (req, res) => {
  const { provider } = req.params;
  const { apiKey } = req.body;
  const sessionId = sessionManager.resolveSessionId(req.headers['x-session-id'], req.body?.sessionId);
  
  if (!providers[provider]) {
    res.status(400).json({ error: 'Bilinmeyen sağlayıcı' });
    return;
  }
  
  if (!apiKey || apiKey.trim() === '') {
    res.status(400).json({ error: 'API anahtarı boş olamaz' });
    return;
  }
  
  const cleanKey = apiKey.trim();

  // Validate and discover models for Gemini
  if (provider === 'gemini') {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
      if (!response.ok) {
        throw new Error(`Google API responded with status: ${response.status}`);
      }
      const data = await response.json();
      if (!data.models || data.models.length === 0) {
        throw new Error('No models found');
      }

      // Filter to text generation models and map to expected format
      let validModels = data.models
        .filter((m: any) => {
          if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
          
          const id = m.name.replace('models/', '').toLowerCase();
          
          // Exclude TTS, Audio, Speech, Video, Image, Vision
          if (id.includes('tts') || id.includes('audio') || id.includes('speech')) return false;
          if (id.includes('image') || id.includes('vision') || id.includes('clip')) return false;
          if (id.includes('transcribe') || id.includes('embedding')) return false;
          
          // Exclude experimental, non-standard, or specialized agents
          if (id.includes('antigravity') || id.includes('deep-research') || id.includes('robotics')) return false;
          if (id.includes('computer-use') || id.includes('omni') || id.includes('lyria')) return false;
          if (id.includes('nano-banana') || id.includes('gemma')) return false;
          
          // Exclude known deprecated models or problematic aliases
          if (id.includes('gemini-2.5')) return false;
          if (id === 'gemini-pro' || id === 'gemini-1.5-pro-latest') return false;
          
          return true;
        })
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', '')
        }));

      // Ensure gemini-3.7-flash or fast model is preferred if present
      validModels = validModels.sort((a: any, b: any) => {
        if (a.id === 'gemini-3.7-flash') return -1;
        if (b.id === 'gemini-3.7-flash') return 1;
        return 0;
      });

      if (validModels.length === 0) {
        res.status(400).json({ error: 'Bu API anahtarı için kullanılabilir Gemini modeli bulunamadı.' });
        return;
      }

      providerModels['gemini'] = validModels;
      console.log(`[Gemini] API key configured successfully. Discovered ${validModels.length} models.`);

    } catch (err: any) {
      console.error(`[Gemini] API key validation failed:`, err.message);
      res.status(400).json({ error: 'API anahtarı geçersiz veya Gemini API erişimi bulunmuyor.' });
      return;
    }
  }

  // Anahtar yalnızca bu oturuma kaydedilir. (Eski sürümdeki ortak "fallback" nesnesi kaldırıldı:
  // bir kullanıcının anahtarı başka bir oturumun isteklerinde kullanılabiliyordu.)
  sessionManager.setApiKey(sessionId, provider, cleanKey);

  res.json({ success: true, configured: true });
});

// Sınıflandırıcı durumu (yerel BERTurk servisi)
app.get('/api/classifier/status', async (_req, res) => {
  const health = await berturkClassifier.health();
  res.json({
    configured: health.ok,
    enabled: config.classifierEnabled,
    model: health.modelVersion ? `BERTurk (${health.modelVersion})` : 'BERTurk (servis çalışmıyor)',
    tau: config.classifierTau,
  });
});

// Category lookup endpoint for queries stored in L1 cache
app.get('/api/chat/category', async (req, res) => {
  const prompt = (req.query.prompt as string || '').trim();
  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }
  const lookup = await exactCacheService.lookup({ prompt });
  if (lookup.hit && lookup.entry) {
    res.json({ category: lookup.entry.classification?.kategori || 'genel' });
    return;
  }
  res.json({ category: null });
});

app.post('/api/chat', async (req, res) => {
  const { provider, model, message, mode = 'baseline', userConsent = true, instructions, format } = req.body;
  const sessionId = sessionManager.resolveSessionId(req.headers['x-session-id'], req.body?.sessionId);
  
  if (!providers[provider]) {
    res.status(400).json({ error: 'Bilinmeyen sağlayıcı' });
    return;
  }
  if (typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: 'Mesaj boş olamaz' });
    return;
  }
  
  const apiKey = sessionManager.getApiKey(sessionId, provider);
  if (!apiKey) {
    res.status(400).json({ error: 'Önce Ayarlar > API bölümünden bir API sağlayıcısı yapılandır.' });
    return;
  }

  const requestId = crypto.randomUUID();
  const requestTimestamp = Date.now();
  const isOptimizedMode = mode === 'optimized';

  try {
    // -------------------------------------------------------------
    // L1 OPTIMIZED MODE FLOW
    //  1. MySQL exact-match sorgusu → HIT ise sohbet API'si ve sınıflandırıcı çağrılmaz
    //  2. MISS → yerel BERTurk sınıflandırıcı (genel/kisisel/degisken/sanatsal)
    //  3. Kullanıcının seçtiği model yanıt üretir
    //  4. Yalnızca genel + p(genel) ≥ τ + yanıt uygunsa MySQL'e TTL ile yazılır
    //  Her BYPASS gerçek nedeniyle (bypassReason) raporlanır.
    // -------------------------------------------------------------
    if (isOptimizedMode) {
      const e2eStart = performance.now();
      const cacheLookup = await exactCacheService.lookup({
        prompt: message,
        instructions,
        format,
      });

      if (cacheLookup.hit && cacheLookup.entry) {
        const entry = cacheLookup.entry;
        console.log(`[L1 HIT] ${requestId} kaynak: ${entry.sourceProvider}/${entry.sourceModel}`);

        // Calculate avoided chat cost for user's selected model (zero if unknown)
        const avoidedCost = calculateAvoidedCost(
          provider,
          model,
          message,
          entry.content,
          entry.originalUsage
        );
        const latencyMs = Math.round(performance.now() - e2eStart);

        // Strict accounting on HIT: User chat tokens and cost MUST be ZERO
        const telemetry: RequestTelemetry = {
          requestId,
          timestamp: requestTimestamp,
          provider,
          model,

          inputTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          totalTokens: 0,

          latencyMs,

          cacheHit: true,
          cacheType: 'exact',
          cacheStatus: 'HIT',
          bypassReason: null,
          questionCategory: entry.classification?.kategori || 'genel',
          classifierConfidence: entry.confidence ?? null,
          classifierModel: entry.classifierVersion ?? null,
          sourceProvider: entry.sourceProvider,
          sourceModel: entry.sourceModel,
          estimatedAvoidedCost: avoidedCost,
          mode: 'optimized',

          compressionUsed: false,
          compressionRatio: null,
          validatorPassed: true,
          escalated: false,
          routerPolicy: null,
          routerConfidence: null,

          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
        };

        const responsePayload: ChatApiResponse = {
          message: {
            role: 'assistant',
            content: entry.content,
          },
          provider,
          model,
          telemetry,
          metrics: {
            inputTokens: 0,
            outputTokens: 0,
            thinkingTokens: 0,
            totalTokens: 0,
            latencyMs,
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            estimatedAvoidedCost: avoidedCost,
          },
        };

        res.json(responsePayload);
        return;
      }

      // MISS (veya DB erişilemez): yerel sınıflandırıcı — milisaniyeler sürer, sohbetten önce çalışır.
      // Sınıflandırma bilgisayar dışına çıkmaz ve maliyeti kullanıcıya yansıtılmaz.
      // Neden önceliği: L1 kapalı > izin yok > sınıflandırıcı hatası / kategori / düşük güven > veritabanı erişilemez
      let decision: ReturnType<typeof decideCacheability> | null = null;
      let bypassReason: BypassReason | null = null;
      if (cacheLookup.bypassReason === 'L1_DISABLED') {
        bypassReason = 'L1_DISABLED';
      } else if (userConsent === false) {
        bypassReason = 'CONSENT_DENIED';
      } else {
        decision = decideCacheability(await berturkClassifier.classify(message), config.classifierTau);
        bypassReason = decision.reason ?? cacheLookup.bypassReason ?? null;
      }

      const providerService = providers[provider];
      const result = await providerService.sendMessage({ apiKey, model, message });

      // Yalnızca önbelleğe uygun ve DB erişilebilir ise yaz (kullanıcı birkaç ms'lik yazmayı bekler;
      // böylece bir sonraki aynı istek kesin HIT olur)
      let cachedSaved = false;
      if (decision?.cacheable && decision.decision && !cacheLookup.bypassReason) {
        const storeResult = await exactCacheService.store({
          prompt: message,
          instructions,
          format,
          content: result.content,
          sourceProvider: provider,
          sourceModel: model,
          originalUsage: result.usage,
          classification: decision.decision,
          classifierVersion: decision.modelVersion,
          confidence: decision.pGenel,
        });
        cachedSaved = storeResult === 'stored';
        if (storeResult === 'rejected') bypassReason = 'RESPONSE_REJECTED';
        else if (storeResult === 'failed') bypassReason = 'STORE_FAILED';
      }

      const cacheStatus: 'MISS' | 'BYPASS' = bypassReason ? 'BYPASS' : 'MISS';
      console.log(`[L1 ${cacheStatus}] ${requestId} kategori=${decision?.category ?? '-'} p(genel)=${decision?.pGenel?.toFixed(3) ?? '-'}${bypassReason ? ` neden=${bypassReason}` : ''}${cachedSaved ? ' (kaydedildi)' : ''}`);

      // Telemetri & maliyet: yalnızca kullanıcının sohbet modeli (sınıflandırıcı hariç)
      const cost = calculateRequestCost(provider, model, result.usage);

      const telemetry: RequestTelemetry = {
        requestId,
        timestamp: requestTimestamp,
        provider,
        model,

        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        thinkingTokens: result.usage.thinkingTokens,
        totalTokens: result.usage.totalTokens,

        latencyMs: Math.round(performance.now() - e2eStart),

        cacheHit: false,
        cacheType: null,
        cacheStatus,
        bypassReason,
        questionCategory: decision?.category ?? null,
        classifierConfidence: decision?.confidence ?? null,
        classifierModel: decision?.modelVersion ?? null,
        cachedSaved,
        mode: 'optimized',

        compressionUsed: false,
        compressionRatio: null,
        validatorPassed: null,
        escalated: false,
        routerPolicy: null,
        routerConfidence: null,

        inputCost: cost.inputCost,
        outputCost: cost.outputCost,
        totalCost: cost.totalCost,
        estimatedAvoidedCost: null,
      };

      const responsePayload: ChatApiResponse = {
        message: {
          role: 'assistant',
          content: result.content,
        },
        provider,
        model,
        telemetry,
        metrics: {
          inputTokens: telemetry.inputTokens,
          outputTokens: telemetry.outputTokens,
          thinkingTokens: telemetry.thinkingTokens,
          totalTokens: telemetry.totalTokens,
          latencyMs: telemetry.latencyMs,
          inputCost: telemetry.inputCost,
          outputCost: telemetry.outputCost,
          totalCost: telemetry.totalCost,
          estimatedAvoidedCost: null,
        },
      };

      res.json(responsePayload);
      return;
    }

    // -------------------------------------------------------------
    // BASELINE MODE FLOW (Untouched base behavior)
    // -------------------------------------------------------------
    const providerService = providers[provider];
    const result = await providerService.sendMessage({ apiKey, model, message });
    
    const cost = calculateRequestCost(provider, model, result.usage);

    const telemetry: RequestTelemetry = {
      requestId,
      timestamp: requestTimestamp,

      provider,
      model,

      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      thinkingTokens: result.usage.thinkingTokens,
      totalTokens: result.usage.totalTokens,

      latencyMs: result.latencyMs,

      cacheHit: false,
      cacheType: null,
      cacheStatus: 'BYPASS',
      bypassReason: null,
      questionCategory: null,
      mode: 'baseline',

      compressionUsed: false,
      compressionRatio: null,

      validatorPassed: null,
      escalated: false,

      routerPolicy: null,
      routerConfidence: null,

      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
      estimatedAvoidedCost: null,
    };

    const costLog = telemetry.totalCost !== null ? `\ntotalCost: $${telemetry.totalCost.toFixed(6)}` : '';

    console.log(`[Baseline Telemetry]
requestId: ${telemetry.requestId}
provider: ${telemetry.provider}
model: ${telemetry.model}
inputTokens: ${telemetry.inputTokens}
outputTokens: ${telemetry.outputTokens}
thinkingTokens: ${telemetry.thinkingTokens}
totalTokens: ${telemetry.totalTokens}
latencyMs: ${telemetry.latencyMs}${costLog}`);

    const responsePayload: ChatApiResponse = {
      message: {
        role: 'assistant',
        content: result.content,
      },
      provider,
      model,
      telemetry,
      metrics: {
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        thinkingTokens: telemetry.thinkingTokens,
        totalTokens: telemetry.totalTokens,
        latencyMs: telemetry.latencyMs,
        inputCost: telemetry.inputCost,
        outputCost: telemetry.outputCost,
        totalCost: telemetry.totalCost,
        estimatedAvoidedCost: null,
      },
    };

    res.json(responsePayload);
  } catch (error: any) {
    console.error('Provider API Error:', error.message);
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('503') || msg.includes('high demand') || msg.includes('service unavailable')) {
      res.status(503).json({ error: 'Bu model şu anda yoğun. Biraz sonra tekrar deneyebilir veya başka bir model seçebilirsin.' });
    } else {
      res.status(500).json({ error: 'Yanıt alınamadı. Lütfen API ayarlarını kontrol et.' });
    }
  }
});

const PORT = 3001;
// Only start listening if not running under a test runner
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    mysqlStorageService.isAvailable();
  });
}
