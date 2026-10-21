import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { openaiProvider } from './services/providers/openai.js';
import { geminiProvider } from './services/providers/gemini.js';
import { groqProvider } from './services/providers/groq.js';
import { calculateRequestCost } from './services/cost/costEngine.js';
import type { LLMProvider, RequestTelemetry, ChatApiResponse } from './types/api.js';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory key store
const apiKeys: Record<string, string> = {};

const providers: Record<string, LLMProvider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  groq: groqProvider,
};

// Available models per provider (mocked for selector)
const providerModels: Record<string, { id: string; name: string }[]> = {
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
  const result = Object.keys(providers).map(id => ({
    id,
    name: id === 'openai' ? 'OpenAI' : id === 'gemini' ? 'Google Gemini' : 'Groq',
    configured: !!apiKeys[id],
    models: providerModels[id] || []
  }));
  res.json({ providers: result });
});

app.post('/api/providers/:provider/configure', async (req, res) => {
  const { provider } = req.params;
  const { apiKey } = req.body;
  
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
          if (id.includes('gemini-2.5')) return false; // Deprecated by mock
          if (id === 'gemini-pro' || id === 'gemini-1.5-pro-latest') return false;
          
          return true;
        })
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', '')
        }));

      // Ensure gemini-3.7-flash is the default (first in list) if present
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
      console.log(`[Gemini] API key configured: YES`);
      console.log(`[Gemini] Available generation models:`);
      validModels.forEach((m: any) => console.log(`- ${m.id}`));

    } catch (err: any) {
      console.error(`[Gemini] API key validation failed:`, err.message);
      res.status(400).json({ error: 'API anahtarı geçersiz veya Gemini API erişimi bulunmuyor.' });
      return;
    }
  }

  apiKeys[provider] = cleanKey;
  res.json({ success: true, configured: true });
});

app.post('/api/chat', async (req, res) => {
  const { provider, model, message } = req.body;
  
  if (!providers[provider]) {
    res.status(400).json({ error: 'Bilinmeyen sağlayıcı' });
    return;
  }
  
  const apiKey = apiKeys[provider];
  if (!apiKey) {
    res.status(400).json({ error: 'Önce Ayarlar > API bölümünden bir API sağlayıcısı yapılandır.' });
    return;
  }

  // Generate canonical requestId before calling provider
  const requestId = crypto.randomUUID();
  const requestTimestamp = Date.now();

  try {
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

      compressionUsed: false,
      compressionRatio: null,

      validatorPassed: null,
      escalated: false,

      routerPolicy: null,
      routerConfidence: null,

      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
    };

    const costLog = telemetry.totalCost !== null ? `\ntotalCost: $${telemetry.totalCost.toFixed(6)}` : '';

    console.log(`[Telemetry]
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
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
