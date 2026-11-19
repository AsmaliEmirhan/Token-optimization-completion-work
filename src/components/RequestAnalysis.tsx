import React, { useState } from 'react';
import { ChevronDown, Info, Database, Sparkles, ShieldCheck } from 'lucide-react';
import type { RequestAnalysisData } from '../types/telemetry';
import { formatCost } from '../utils/metrics';

export type RequestAnalysisProps = RequestAnalysisData;

const formatNumber = (num: number | null): string => {
  if (num === null || num === undefined) return '—';
  return new Intl.NumberFormat('tr-TR').format(num);
};

const formatLatency = (ms: number | null): string => {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} sn`;
};

const getProviderDisplayName = (provider: string): string => {
  const p = (provider || '').toLowerCase().trim();
  if (p === 'gemini') return 'Google Gemini';
  if (p === 'openai') return 'OpenAI';
  if (p === 'groq') return 'Groq';
  return provider || '—';
};

const getCategoryBadge = (category: string | null | undefined) => {
  if (!category) return null;
  switch (category) {
    case 'genel':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <ShieldCheck size={10} />
          Genel Soru
        </span>
      );
    case 'kisisel':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          Kişisel Bağlam
        </span>
      );
    case 'degisken':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          Değişken / Canlı
        </span>
      );
    case 'sanatsal':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
          Sanatsal
        </span>
      );
    default:
      return null;
  }
};

// Sunucudaki BypassReason kodlarının kullanıcıya gösterilen karşılıkları
const BYPASS_REASON_TEXT: Record<string, string> = {
  L1_DISABLED: 'L1 önbellek kapalı',
  CONSENT_DENIED: 'Sınıflandırma izni kapalı',
  CLASSIFIER_DISABLED: 'Sınıflandırıcı kapalı',
  CLASSIFIER_UNAVAILABLE: 'Sınıflandırıcı servisine ulaşılamadı',
  CLASSIFIER_TIMEOUT: 'Sınıflandırıcı zaman aşımı',
  CLASSIFIER_INVALID_RESPONSE: 'Sınıflandırıcı yanıtı geçersiz',
  CATEGORY_KISISEL: 'Kişisel soru — paylaşılmaz',
  CATEGORY_DEGISKEN: 'Değişken soru — güncel veri gerekir',
  CATEGORY_SANATSAL: 'Sanatsal istek — özgün çıktı beklenir',
  LOW_CONFIDENCE: 'Genel ama güven eşiğin altında',
  DB_UNAVAILABLE: 'Veritabanına ulaşılamadı',
  RESPONSE_REJECTED: 'Yanıt ortak kullanıma uygun değil',
  STORE_FAILED: 'Önbelleğe yazılamadı',
};

export const RequestAnalysis: React.FC<RequestAnalysisProps> = ({
  provider,
  model,
  inputTokens,
  outputTokens,
  thinkingTokens,
  totalTokens,
  latencyMs,
  totalCost,
  cacheHit,
  cacheStatus,
  bypassReason,
  questionCategory,
  sourceProvider,
  sourceModel,
  estimatedAvoidedCost,
  mode,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const friendlyProvider = getProviderDisplayName(provider);
  const friendlySourceProvider = sourceProvider ? getProviderDisplayName(sourceProvider) : null;
  const isHit = Boolean(cacheHit || cacheStatus === 'HIT');

  return (
    <div className="mt-1.5 self-start select-none">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'İstek analizini daralt' : 'İstek analizini genişlet'}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#F0F2F5]/70 dark:hover:bg-[#1A1F27]/70 rounded-md transition-colors cursor-pointer"
        >
          <span>İstek Analizi</span>
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {/* L1 Cache Status Pill */}
        {mode === 'optimized' && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide transition-colors ${
              isHit
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                : cacheStatus === 'MISS'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20'
            }`}
          >
            <Database size={9} />
            {isHit ? 'L1 İsabet (HIT)' : cacheStatus === 'MISS' ? 'L1 Iska (MISS)' : 'L1 Devre Dışı (BYPASS)'}
          </span>
        )}

        {/* BYPASS gerekçesi */}
        {mode === 'optimized' && !isHit && cacheStatus === 'BYPASS' && bypassReason && (
          <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6]" title={bypassReason}>
            {BYPASS_REASON_TEXT[bypassReason] || bypassReason}
          </span>
        )}

        {/* Category Pill */}
        {getCategoryBadge(questionCategory)}
      </div>

      {isExpanded && (
        <div className="mt-2 w-full max-w-[400px] p-3.5 rounded-xl bg-[#FAF9F5] dark:bg-[#12151A] border border-[#EAE7DC] dark:border-white/[0.08] shadow-xs text-[#071A3D] dark:text-[#F4F4F5] animate-popover-in">
          {/* Header row: Model and Provider */}
          <div className="grid grid-cols-2 gap-3 pb-2.5 mb-2.5 border-b border-[#EAE7DC] dark:border-white/[0.06]">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#596E8A] dark:text-[#9299A6] block mb-0.5">
                Hedef Model
              </span>
              <span
                className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] truncate block"
                title={model}
              >
                {model || '—'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#596E8A] dark:text-[#9299A6] block mb-0.5">
                Sağlayıcı
              </span>
              <span className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] truncate block">
                {friendlyProvider}
              </span>
            </div>
          </div>

          {/* If Cache HIT: Display Original Source Provider & Model */}
          {isHit && (
            <div className="p-2 mb-2.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-semibold">
                <Sparkles size={12} />
                <span>Ortak L1 Önbellekten Sağlandı</span>
              </div>
              <div className="text-[10.5px] text-[#596E8A] dark:text-[#A1A1AA]">
                İlk Üreten Kaynak:{' '}
                <span className="font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                  {friendlySourceProvider || '—'} ({sourceModel || '—'})
                </span>
              </div>
            </div>
          )}

          {/* Metrics grid */}
          <div className="space-y-1.5 pb-2.5 mb-2.5 border-b border-[#EAE7DC] dark:border-white/[0.06]">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#596E8A] dark:text-[#9299A6]">Girdi Token</span>
              <span className={`font-semibold tabular-nums ${isHit ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                {formatNumber(inputTokens)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#596E8A] dark:text-[#9299A6]">Çıktı Token</span>
              <span className={`font-semibold tabular-nums ${isHit ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                {formatNumber(outputTokens)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#596E8A] dark:text-[#9299A6]">Düşünme Tokenı</span>
              <span className="font-semibold tabular-nums">
                {formatNumber(thinkingTokens)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11.5px]">
              <div className="flex items-center gap-1">
                <span className="text-[#596E8A] dark:text-[#9299A6]">Toplam Token</span>
                <div className="group relative inline-flex items-center">
                  <Info
                    size={11}
                    className="text-[#596E8A] dark:text-[#9299A6] cursor-help"
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-48 p-2 bg-[#071A3D] dark:bg-white text-white dark:text-[#071A3D] text-[10px] leading-relaxed rounded-lg shadow-lg text-center z-50 pointer-events-none">
                    {isHit
                      ? 'Önbellek isabetinde hedef sohbet modeline yeni API çağrısı yapılmadığı için kullanıcı token kullanımı 0’dır.'
                      : 'Toplam token; girdi, çıktı ve model düşünme tokenlarını içerir. Sınıflandırıcı tokenları dahil edilmez.'}
                  </div>
                </div>
              </div>
              <span className={`font-semibold tabular-nums ${isHit ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                {formatNumber(totalTokens)}
              </span>
            </div>
          </div>

          {/* Latency & Cost rows */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#596E8A] dark:text-[#9299A6]">Yanıt Süresi</span>
              <span className="font-semibold tabular-nums">
                {formatLatency(latencyMs)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11.5px]">
              <div className="flex items-center gap-1">
                <span className="text-[#596E8A] dark:text-[#9299A6]">Sohbet API Maliyeti</span>
                <div className="group relative inline-flex items-center">
                  <Info
                    size={11}
                    className="text-[#596E8A] dark:text-[#9299A6] cursor-help"
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-56 p-2 bg-[#071A3D] dark:bg-white text-white dark:text-[#071A3D] text-[10px] leading-relaxed rounded-lg shadow-lg text-center z-50 pointer-events-none">
                    Yalnızca kullanıcının seçtiği sohbet modeline ait harcamadır. TokenAI sınıflandırıcı ve altyapı maliyetleri kullanıcıya yansıtılmaz.
                  </div>
                </div>
              </div>
              <span className={`font-semibold tabular-nums ${isHit ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                {formatCost(totalCost)}
              </span>
            </div>

            {/* Avoided Chat Cost on HIT */}
            {isHit && typeof estimatedAvoidedCost === 'number' && (
              <div className="flex items-center justify-between text-[11.5px] pt-1 border-t border-[#EAE7DC]/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <span className="font-medium">Tahmini Önlenen API Maliyeti</span>
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatCost(estimatedAvoidedCost)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
