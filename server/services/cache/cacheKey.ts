import crypto from 'node:crypto';

export interface CacheKeyParams {
  prompt: string;
  instructions?: string;
  format?: string;
  policyVersion?: string;
}

/**
 * Normalizes text for exact-match caching:
 * - NFC Unicode normalization
 * - Standardizes CRLF to LF
 * - Trims and collapses multiple horizontal spaces on each line
 * - Applies Turkish-aware lowercase folding
 * - Removes only trailing sentence punctuation (?, ., !, …) — "neresidir?" == "neresidir"
 * - Preserves semantic content, structural line breaks, and inner punctuation
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .trim()
    .replace(/[\s?.!…]+$/u, '')
    .toLocaleLowerCase('tr-TR');
}

/**
 * Generates a deterministic SHA-256 cache key for L1 Exact Match.
 * Strictly excludes provider and model names to ensure cross-model caching.
 */
export function generateExactCacheKey({
  prompt,
  instructions,
  format,
  policyVersion = 'v1',
}: CacheKeyParams): { key: string; hash: string; normalizedPrompt: string } {
  const normPrompt = normalizeText(prompt);
  const normInstructions = instructions ? normalizeText(instructions) : '';
  const normFormat = format ? normalizeText(format) : '';

  // Canonical payload for hash
  const canonicalPayload = JSON.stringify({
    v: policyVersion,
    p: normPrompt,
    i: normInstructions || null,
    f: normFormat || null,
  });

  const hash = crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  const key = `tokenai:l1:${policyVersion}:${hash}`;

  return {
    key,
    hash,
    normalizedPrompt: normPrompt,
  };
}
