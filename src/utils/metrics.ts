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

export interface CostSavingsResult {
  savedCost: number;
  savingsPercentage: number;
}

/**
 * Pure utility to calculate cost savings between baseline and optimized requests.
 * Returns null unless both costs are valid numbers and baselineCost > 0.
 */
export const calculateCostSavings = (
  baselineCost: number | null | undefined,
  optimizedCost: number | null | undefined
): CostSavingsResult | null => {
  if (
    typeof baselineCost !== 'number' ||
    typeof optimizedCost !== 'number' ||
    Number.isNaN(baselineCost) ||
    Number.isNaN(optimizedCost) ||
    baselineCost <= 0
  ) {
    return null;
  }
  const savedCost = Number((baselineCost - optimizedCost).toFixed(8));
  const savingsPercentage = Number((((baselineCost - optimizedCost) / baselineCost) * 100).toFixed(2));
  return { savedCost, savingsPercentage };
};

/**
 * Reusable USD cost formatter.
 * Handles large values ($12.34) and preserves precision for micro LLM costs ($0.002341, $0.000012)
 * without rounding down to $0.00.
 * Returns '—' for null or undefined.
 */
export const formatCost = (cost: number | null | undefined): string => {
  if (cost === null || cost === undefined || Number.isNaN(cost)) {
    return '—';
  }
  if (cost === 0) {
    return '$0.00';
  }
  if (cost >= 1) {
    return `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cost >= 0.01) {
    const formatted = cost.toFixed(4).replace(/0+$/, '');
    const parts = formatted.split('.');
    if (parts[1] && parts[1].length < 2) {
      return `$${parts[0]}.${parts[1].padEnd(2, '0')}`;
    }
    return `$${formatted}`;
  }
  const precision = cost < 0.00001 ? 8 : 6;
  const formatted = cost.toFixed(precision).replace(/0+$/, '');
  return `$${formatted}`;
};

export interface CostAggregateResult {
  totalKnownCost: number | null;
  knownCostRecordCount: number;
  unknownCostRecordCount: number;
  hasPartialCoverage: boolean;
}

/**
 * Calculates aggregate cost from experiment records, tracking coverage.
 */
export const calculateCostAggregate = (records: ExperimentRecord[]): CostAggregateResult => {
  let knownCostRecordCount = 0;
  let unknownCostRecordCount = 0;
  let totalCostSum = 0;

  for (const record of records) {
    const cost = record.metrics.totalCost;
    if (typeof cost === 'number' && !Number.isNaN(cost)) {
      totalCostSum += cost;
      knownCostRecordCount++;
    } else {
      unknownCostRecordCount++;
    }
  }

  const totalKnownCost = knownCostRecordCount > 0 ? Number(totalCostSum.toFixed(8)) : null;
  const hasPartialCoverage = knownCostRecordCount > 0 && unknownCostRecordCount > 0;

  return {
    totalKnownCost,
    knownCostRecordCount,
    unknownCostRecordCount,
    hasPartialCoverage,
  };
};

