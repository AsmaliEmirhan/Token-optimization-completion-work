import type { ExperimentRecord } from '../types/telemetry';

export type MetricsTimeRange = 'hour' | 'day' | 'week' | 'month';

export const getTimeRangeDurationMs = (range: MetricsTimeRange): number => {
  switch (range) {
    case 'hour':
      return 60 * 60 * 1000; // 60 minutes
    case 'day':
      return 24 * 60 * 60 * 1000; // 24 hours
    case 'week':
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    case 'month':
      return 30 * 24 * 60 * 60 * 1000; // 30 days
  }
};

export const getTimeRangeLabel = (range: MetricsTimeRange): string => {
  switch (range) {
    case 'hour':
      return 'Son 60 dakika';
    case 'day':
      return 'Son 24 saat';
    case 'week':
      return 'Son 7 gün';
    case 'month':
      return 'Son 30 gün';
  }
};

export const filterRecordsByTimeRange = (
  records: ExperimentRecord[],
  selectedRange: MetricsTimeRange,
  now: number = Date.now()
): ExperimentRecord[] => {
  const durationMs = getTimeRangeDurationMs(selectedRange);
  const cutoff = now - durationMs;
  return records.filter((r) => r.timestamp >= cutoff);
};

export const calculateTokenReduction = (baselineTokens: number | null, optimizedTokens: number | null): number | null => {
  if (baselineTokens === null || optimizedTokens === null || baselineTokens === 0) {
    return null;
  }
  return Number((((baselineTokens - optimizedTokens) / baselineTokens) * 100).toFixed(2));
};

export const calculateLatencyChange = (baselineLatency: number, optimizedLatency: number): number => {
  if (baselineLatency === 0) return 0;
  return Number((((baselineLatency - optimizedLatency) / baselineLatency) * 100).toFixed(2));
};

export const calculateSavedTokens = (
  baselineTokens: number | null | undefined,
  optimizedTokens: number | null | undefined
): number | null => {
  if (
    baselineTokens === null ||
    baselineTokens === undefined ||
    optimizedTokens === null ||
    optimizedTokens === undefined
  ) {
    return null;
  }
  return baselineTokens - optimizedTokens;
};

export const calculateSavingsPercentage = (
  baselineValue: number | null | undefined,
  optimizedValue: number | null | undefined
): number | null => {
  if (
    baselineValue === null ||
    baselineValue === undefined ||
    optimizedValue === null ||
    optimizedValue === undefined ||
    baselineValue <= 0
  ) {
    return null;
  }
  return Number((((baselineValue - optimizedValue) / baselineValue) * 100).toFixed(2));
};

export interface PairedSavingsResult {
  savedTokens: number;
  savingsPercentage: number;
}

/**
 * Calculates aggregate savings for paired baseline and optimized records sharing the same comparisonGroupId.
 * If no valid pair exists, returns null.
 */
export const calculateAggregatePairSavings = (
  records: ExperimentRecord[]
): PairedSavingsResult | null => {
  const baselineByGroup = new Map<string, ExperimentRecord>();
  const optimizedByGroup = new Map<string, ExperimentRecord>();

  for (const r of records) {
    if (!r.comparisonGroupId) continue;
    if (r.mode === 'baseline') {
      baselineByGroup.set(r.comparisonGroupId, r);
    } else if (r.mode === 'optimized') {
      optimizedByGroup.set(r.comparisonGroupId, r);
    }
  }

  let totalBaselineTokens = 0;
  let totalOptimizedTokens = 0;
  let pairedCount = 0;

  for (const [groupId, baseRec] of baselineByGroup) {
    const optRec = optimizedByGroup.get(groupId);
    if (!optRec) continue;

    const baseTotal = baseRec.metrics.totalTokens;
    const optTotal = optRec.metrics.totalTokens;

    if (typeof baseTotal === 'number' && typeof optTotal === 'number') {
      totalBaselineTokens += baseTotal;
      totalOptimizedTokens += optTotal;
      pairedCount++;
    }
  }

  if (pairedCount === 0 || totalBaselineTokens === 0) {
    return null;
  }

  const savedTokens = totalBaselineTokens - totalOptimizedTokens;
  const savingsPercentage = Number(
    (((totalBaselineTokens - totalOptimizedTokens) / totalBaselineTokens) * 100).toFixed(2)
  );

  return { savedTokens, savingsPercentage };
};

