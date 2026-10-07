import React, { useEffect } from 'react';
import { ChartNoAxesColumnIncreasing, Clock, Zap, Info } from 'lucide-react';

export interface RequestMetrics {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  timestamp: number;
}

export interface ExperimentRecord {
  id: string;
  timestamp: number;
  mode: "baseline" | "optimized";
  provider: string;
  model: string;
  prompt: string;
  response?: string;
  comparisonGroupId?: string;
  metrics: {
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    totalTokens: number | null;
    latencyMs: number;
  };
}

export interface SessionMetrics {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  averageLatencyMs: number;
}

interface MetricsPopoverProps {
  experimentRecords: ExperimentRecord[];
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export const MetricsPopover: React.FC<MetricsPopoverProps> = ({ 
  experimentRecords,
  onClose,
  triggerRef 
}) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      
      const toggleBtn = document.getElementById('metrics-toggle-button');
      if (toggleBtn && toggleBtn.contains(target)) return;
      
      const popover = document.getElementById('metrics-popover');
      if (popover && !popover.contains(target)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, triggerRef]);

  const formatNumber = (num: number) => new Intl.NumberFormat('tr-TR').format(num);
  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} sn`;
  };

  const latestRecord = experimentRecords.length > 0 ? experimentRecords[experimentRecords.length - 1] : null;

  const totalRequests = experimentRecords.length;
  const totalInputTokens = experimentRecords.reduce((acc, rec) => acc + (rec.metrics.inputTokens || 0), 0);
  const totalOutputTokens = experimentRecords.reduce((acc, rec) => acc + (rec.metrics.outputTokens || 0), 0);
  const totalThinkingTokens = experimentRecords.reduce((acc, rec) => acc + (rec.metrics.thinkingTokens || 0), 0);
  const totalTokens = experimentRecords.reduce((acc, rec) => acc + (rec.metrics.totalTokens || 0), 0);
  const averageLatencyMs = totalRequests > 0 
    ? experimentRecords.reduce((acc, rec) => acc + rec.metrics.latencyMs, 0) / totalRequests 
    : 0;

  return (
    <div 
      id="metrics-popover"
      className="absolute top-full right-0 mt-3 w-[320px] bg-white dark:bg-[#101216] border border-[#E8E5DC] dark:border-white/[0.08] shadow-[0_20px_50px_-12px_rgba(7,26,61,0.15)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] rounded-[20px] overflow-hidden animate-popover-in z-50 select-none"
    >
      <div className="px-4 py-3 border-b border-[#EAE7DC] dark:border-white/[0.08] flex items-center gap-2">
        <ChartNoAxesColumnIncreasing size={18} className="text-[#1677FF]" />
        <h3 className="text-[14px] font-bold text-[#071A3D] dark:text-[#F4F4F5]">Kullanım İstatistikleri</h3>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {!latestRecord ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-full bg-[#FAF9F5] dark:bg-[#14171C] flex items-center justify-center mb-3">
              <Zap size={20} className="text-[#596E8A] dark:text-[#68707D]" />
            </div>
            <p className="text-[13px] font-medium text-[#071A3D] dark:text-[#F4F4F5] mb-1">Henüz kullanım verisi yok</p>
            <p className="text-[11.5px] text-[#596E8A] dark:text-[#9299A6] leading-relaxed">Bir yapay zeka yanıtı aldıktan sonra token ve süre bilgileri burada görünecek.</p>
          </div>
        ) : (
          <>
            {/* Latest Request */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#596E8A] dark:text-[#9299A6]">SON İSTEK</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EEF5FF] dark:bg-[#1677FF]/15 text-[#1677FF] dark:text-[#40BFFF]">
                  {latestRecord.mode === 'baseline' ? 'Baseline' : 'Optimized'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6]">Sağlayıcı</p>
                    <p className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                      {latestRecord.provider === 'openai' ? 'OpenAI' : latestRecord.provider === 'gemini' ? 'Google Gemini' : 'Groq'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6]">Model</p>
                    <p className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] truncate" title={latestRecord.model}>{latestRecord.model}</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                  <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6] mb-0.5">Yanıt Süresi</p>
                  <p className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{formatLatency(latestRecord.metrics.latencyMs)}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                  <div className="flex items-center gap-1 mb-0.5">
                    <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6]">Toplam Token</p>
                    <div className="group relative">
                      <Info size={10} className="text-[#596E8A] dark:text-[#9299A6] cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-48 p-2 bg-[#071A3D] dark:bg-white text-white dark:text-[#071A3D] text-[10px] rounded shadow-lg text-center z-50">
                        Toplam token; girdi, çıktı ve model tarafından kullanılan düşünme tokenları gibi sağlayıcının raporladığı ek tokenları içerebilir.
                      </div>
                    </div>
                  </div>
                  <p className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{latestRecord.metrics.totalTokens != null ? formatNumber(latestRecord.metrics.totalTokens) : '—'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                  <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6] mb-0.5">Girdi Token</p>
                  <p className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{latestRecord.metrics.inputTokens != null ? formatNumber(latestRecord.metrics.inputTokens) : '—'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                  <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6] mb-0.5">Çıktı Token</p>
                  <p className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{latestRecord.metrics.outputTokens != null ? formatNumber(latestRecord.metrics.outputTokens) : '—'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04] col-span-2">
                  <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6] mb-0.5">Düşünme Tokenı</p>
                  <p className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{latestRecord.metrics.thinkingTokens != null ? formatNumber(latestRecord.metrics.thinkingTokens) : '—'}</p>
                </div>
              </div>
            </div>

            {/* Session Totals */}
            {totalRequests > 0 && (
              <div className="border-t border-[#EAE7DC] dark:border-white/[0.08] pt-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#596E8A] dark:text-[#9299A6] mb-3 block">OTURUM ÖZETİ</span>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#596E8A] dark:text-[#9299A6]">Toplam İstek</span>
                    <span className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{formatNumber(totalRequests)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#596E8A] dark:text-[#9299A6]">Toplam Girdi Token</span>
                    <span className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{totalInputTokens > 0 ? formatNumber(totalInputTokens) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#596E8A] dark:text-[#9299A6]">Toplam Çıktı Token</span>
                    <span className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{totalOutputTokens > 0 ? formatNumber(totalOutputTokens) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#596E8A] dark:text-[#9299A6]">Toplam Düşünme Tokenı</span>
                    <span className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{totalThinkingTokens > 0 ? formatNumber(totalThinkingTokens) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#596E8A] dark:text-[#9299A6]">Toplam Token</span>
                    <span className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{totalTokens > 0 ? formatNumber(totalTokens) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-[#596E8A] dark:text-[#9299A6]">
                      <Clock size={12} />
                      <span className="text-[12px]">Ortalama Yanıt Süresi</span>
                    </div>
                    <span className="text-[12px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">{formatLatency(averageLatencyMs)}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
