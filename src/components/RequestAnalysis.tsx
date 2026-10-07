import React, { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
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

export const RequestAnalysis: React.FC<RequestAnalysisProps> = ({
  provider,
  model,
  inputTokens,
  outputTokens,
  thinkingTokens,
  totalTokens,
  latencyMs,
  totalCost,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const friendlyProvider = getProviderDisplayName(provider);

  return (
    <div className="mt-1.5 self-start select-none">
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

      {isExpanded && (
        <div className="mt-1.5 w-full max-w-[380px] p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#12151A] border border-[#EAE7DC] dark:border-white/[0.08] shadow-xs text-[#071A3D] dark:text-[#F4F4F5] animate-popover-in">
          {/* Header row: Model and Provider */}
          <div className="grid grid-cols-2 gap-3 pb-2.5 mb-2.5 border-b border-[#EAE7DC] dark:border-white/[0.06]">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#596E8A] dark:text-[#9299A6] block mb-0.5">
                Model
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

          {/* Metrics grid */}
          <div className="space-y-1.5 pb-2.5 mb-2.5 border-b border-[#EAE7DC] dark:border-white/[0.06]">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#596E8A] dark:text-[#9299A6]">Girdi Token</span>
              <span className="font-semibold tabular-nums">
                {formatNumber(inputTokens)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#596E8A] dark:text-[#9299A6]">Çıktı Token</span>
              <span className="font-semibold tabular-nums">
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
                    Toplam token; girdi, çıktı ve model tarafından kullanılan düşünme tokenları gibi sağlayıcının raporladığı ek tokenları içerebilir.
                  </div>
                </div>
              </div>
              <span className="font-semibold tabular-nums">
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
                <span className="text-[#596E8A] dark:text-[#9299A6]">Tahmini API Maliyeti</span>
                <div className="group relative inline-flex items-center">
                  <Info
                    size={11}
                    className="text-[#596E8A] dark:text-[#9299A6] cursor-help"
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 p-2 bg-[#071A3D] dark:bg-white text-white dark:text-[#071A3D] text-[10px] leading-relaxed rounded-lg shadow-lg text-center z-50 pointer-events-none">
                    Bu değer sağlayıcının yapılandırılmış token fiyatları ve gerçek kullanım metrikleri üzerinden hesaplanır.
                  </div>
                </div>
              </div>
              <span className="font-semibold tabular-nums">
                {formatCost(totalCost)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
