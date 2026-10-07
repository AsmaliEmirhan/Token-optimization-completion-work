import React, { useState, useMemo, useEffect } from 'react';
import { ChartNoAxesColumnIncreasing, Clock, Zap, Info, Layers, DollarSign } from 'lucide-react';
import type { ExperimentRecord, RequestMetrics, RequestTelemetry } from '../types/telemetry';
import { 
  filterRecordsByTimeRange, 
  getTimeRangeLabel, 
  type MetricsTimeRange 
} from '../utils/metrics';

export type { ExperimentRecord, RequestMetrics, RequestTelemetry };

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

const timeRangeOptions: { id: MetricsTimeRange; label: string }[] = [
  { id: 'hour', label: 'Saatlik' },
  { id: 'day', label: 'Günlük' },
  { id: 'week', label: 'Haftalık' },
  { id: 'month', label: 'Aylık' },
];

export const MetricsPopover: React.FC<MetricsPopoverProps> = ({ 
  experimentRecords,
  onClose,
  triggerRef 
}) => {
  const [selectedRange, setSelectedRange] = useState<MetricsTimeRange>('day');

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

  const filteredRecords = useMemo(() => {
    return filterRecordsByTimeRange(experimentRecords, selectedRange);
  }, [experimentRecords, selectedRange]);

  const totalRequests = filteredRecords.length;
  const totalInputTokens = useMemo(() => {
    return filteredRecords.reduce((acc, rec) => acc + (rec.metrics.inputTokens || 0), 0);
  }, [filteredRecords]);

  const totalOutputTokens = useMemo(() => {
    return filteredRecords.reduce((acc, rec) => acc + (rec.metrics.outputTokens || 0), 0);
  }, [filteredRecords]);

  const totalThinkingTokens = useMemo(() => {
    return filteredRecords.reduce((acc, rec) => acc + (rec.metrics.thinkingTokens || 0), 0);
  }, [filteredRecords]);

  const totalTokens = useMemo(() => {
    return filteredRecords.reduce((acc, rec) => acc + (rec.metrics.totalTokens || 0), 0);
  }, [filteredRecords]);

  const averageLatencyMs = useMemo(() => {
    return totalRequests > 0 
      ? filteredRecords.reduce((acc, rec) => acc + rec.metrics.latencyMs, 0) / totalRequests 
      : 0;
  }, [filteredRecords, totalRequests]);

  return (
    <div 
      id="metrics-popover"
      className="absolute top-full right-0 mt-3 w-[360px] sm:w-[380px] max-h-[85vh] overflow-y-auto conversation-scrollbar bg-white dark:bg-[#101216] border border-[#E8E5DC] dark:border-white/[0.08] shadow-[0_20px_50px_-12px_rgba(7,26,61,0.15)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] rounded-[22px] animate-popover-in z-50 select-none"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[#EAE7DC] dark:border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChartNoAxesColumnIncreasing size={18} className="text-[#1677FF]" />
          <h3 className="text-[14px] font-bold text-[#071A3D] dark:text-[#F4F4F5]">Kullanım Analizi</h3>
        </div>
        <span className="text-[10.5px] font-medium text-[#596E8A] dark:text-[#9299A6]">
          {getTimeRangeLabel(selectedRange)}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Time Range Selector */}
        <div className="flex items-center p-1 bg-[#FAF9F5] dark:bg-[#14171C] rounded-xl border border-[#EAE7DC] dark:border-white/[0.04]">
          {timeRangeOptions.map((tr) => (
            <button
              key={tr.id}
              type="button"
              onClick={() => setSelectedRange(tr.id)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                selectedRange === tr.id
                  ? 'bg-white dark:bg-[#1E232B] text-[#1677FF] dark:text-[#40BFFF] shadow-xs'
                  : 'text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>

        {totalRequests === 0 ? (
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#FAF9F5] dark:bg-[#14171C] flex items-center justify-center mb-3">
              <Zap size={20} className="text-[#596E8A] dark:text-[#68707D]" />
            </div>
            <p className="text-[13px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] mb-1">
              Bu zaman aralığında henüz kullanım verisi yok
            </p>
            <p className="text-[11.5px] text-[#596E8A] dark:text-[#9299A6] leading-relaxed max-w-[260px]">
              Seçilen aralıkta ({getTimeRangeLabel(selectedRange).toLowerCase()}) yapılan istekler burada özetlenecek.
            </p>
          </div>
        ) : (
          <>
            {/* Toplam Analiz */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#596E8A] dark:text-[#9299A6]">
                  TOPLAM ANALİZ
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EEF5FF] dark:bg-[#1677FF]/15 text-[#1677FF] dark:text-[#40BFFF]">
                  {formatNumber(totalRequests)} İstek
                </span>
              </div>

              {/* Quick metrics header */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                  <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6] mb-0.5">Toplam İstek</p>
                  <p className="text-[13px] font-bold text-[#071A3D] dark:text-[#F4F4F5] tabular-nums">
                    {formatNumber(totalRequests)}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Clock size={10} className="text-[#596E8A] dark:text-[#9299A6]" />
                    <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6]">Ort. Yanıt Süresi</p>
                  </div>
                  <p className="text-[13px] font-bold text-[#071A3D] dark:text-[#F4F4F5] tabular-nums">
                    {formatLatency(averageLatencyMs)}
                  </p>
                </div>
              </div>

              {/* Token Breakdown Box */}
              <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EAE7DC] dark:border-white/[0.06]">
                  <div className="flex items-center gap-1">
                    <p className="text-[11.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">Toplam Token</p>
                    <div className="group relative inline-flex items-center">
                      <Info size={11} className="text-[#596E8A] dark:text-[#9299A6] cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 p-2 bg-[#071A3D] dark:bg-white text-white dark:text-[#071A3D] text-[10px] leading-relaxed rounded-lg shadow-lg text-center z-50 pointer-events-none">
                        Toplam token; girdi, çıktı ve model tarafından kullanılan düşünme tokenları gibi sağlayıcının raporladığı ek tokenları içerebilir.
                      </div>
                    </div>
                  </div>
                  <p className="text-[14px] font-bold text-[#1677FF] dark:text-[#40BFFF] tabular-nums">
                    {formatNumber(totalTokens)}
                  </p>
                </div>

                <div className="space-y-1.5 text-[11.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#596E8A] dark:text-[#9299A6]">Girdi Token</span>
                    <span className="font-medium text-[#071A3D] dark:text-[#F4F4F5] tabular-nums">
                      {formatNumber(totalInputTokens)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[#596E8A] dark:text-[#9299A6]">Çıktı Token</span>
                    <span className="font-medium text-[#071A3D] dark:text-[#F4F4F5] tabular-nums">
                      {formatNumber(totalOutputTokens)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[#596E8A] dark:text-[#9299A6]">Düşünme Tokenı</span>
                    <span className="font-medium text-[#071A3D] dark:text-[#F4F4F5] tabular-nums">
                      {totalThinkingTokens > 0 ? formatNumber(totalThinkingTokens) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Optimizasyon Analizi */}
            <div className="border-t border-[#EAE7DC] dark:border-white/[0.08] pt-3.5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Layers size={13} className="text-[#596E8A] dark:text-[#9299A6]" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#596E8A] dark:text-[#9299A6]">
                  OPTİMİZASYON ANALİZİ
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04] space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                  <div>
                    <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6] block">Kurtarılan Token</span>
                    <span className="font-semibold text-[#071A3D] dark:text-[#F4F4F5]">—</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6] block">Token Tasarrufu</span>
                    <span className="font-semibold text-[#071A3D] dark:text-[#F4F4F5]">—</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11.5px] pt-1.5 border-t border-[#EAE7DC]/60 dark:border-white/[0.04]">
                  <div>
                    <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6] block">Kurtarılan Maliyet</span>
                    <span className="font-semibold text-[#071A3D] dark:text-[#F4F4F5]">—</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6] block">Maliyet Tasarrufu</span>
                    <span className="font-semibold text-[#071A3D] dark:text-[#F4F4F5]">—</span>
                  </div>
                </div>

                <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6] pt-1 italic">
                  Optimizasyon verileri kullanılabilir olduğunda burada gösterilecek.
                </p>
              </div>
            </div>

            {/* Maliyet */}
            <div className="border-t border-[#EAE7DC] dark:border-white/[0.08] pt-3.5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <DollarSign size={13} className="text-[#596E8A] dark:text-[#9299A6]" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#596E8A] dark:text-[#9299A6]">
                  MALİYET
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.04]">
                <div className="grid grid-cols-2 gap-2 text-[11.5px] mb-2">
                  <div>
                    <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6] block">Toplam Harcanan</span>
                    <span className="font-semibold text-[#071A3D] dark:text-[#F4F4F5]">—</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6] block">Kurtarılan Maliyet</span>
                    <span className="font-semibold text-[#071A3D] dark:text-[#F4F4F5]">—</span>
                  </div>
                </div>

                <p className="text-[10px] text-[#596E8A] dark:text-[#9299A6] italic">
                  Maliyet motoru etkinleştirildiğinde hesaplanacak.
                </p>
              </div>
            </div>

            {/* Footer Session Note */}
            <div className="pt-1 text-center">
              <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6]">
                Mevcut oturum verileri gösteriliyor.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

