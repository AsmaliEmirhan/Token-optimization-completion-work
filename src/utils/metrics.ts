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
