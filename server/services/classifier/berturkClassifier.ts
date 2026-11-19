import { config } from '../../config/env.js';
import type { QuestionCategory } from '../cache/cacheTypes.js';

/**
 * Yerel BERTurk sınıflandırma servisinin (classifier-service/server.py) istemcisi.
 * Servis yalnızca 127.0.0.1 üzerinde çalışır; soru metni bilgisayar dışına çıkmaz.
 */

export const CATEGORIES: readonly QuestionCategory[] = ['genel', 'kisisel', 'degisken', 'sanatsal'];

export type ClassifierFailureReason =
  | 'CLASSIFIER_DISABLED'
  | 'CLASSIFIER_UNAVAILABLE'
  | 'CLASSIFIER_TIMEOUT'
  | 'CLASSIFIER_INVALID_RESPONSE';

export interface ClassifierSuccess {
  ok: true;
  label: QuestionCategory;
  probs: Record<QuestionCategory, number>;
  pGenel: number;
  modelVersion: string;
  serviceTau: number;
  latencyMs: number;
}

export interface ClassifierFailure {
  ok: false;
  reason: ClassifierFailureReason;
  detail: string;
}

export type ClassifierResult = ClassifierSuccess | ClassifierFailure;

const isProb = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;

/**
 * Servis yanıtını doğrular. Eksik, geçersiz veya kendi içinde çelişkili yanıt reddedilir:
 * - Etiket bilinen dört kategoriden biri olmalı
 * - Her olasılık [0,1] aralığında, toplamı ~1 olmalı
 * - Etiket en yüksek olasılıklı sınıf olmalı, p_genel probs.genel ile aynı olmalı
 */
export function parseClassifierResponse(raw: unknown): ClassifierResult {
  const bad = (detail: string): ClassifierFailure => ({ ok: false, reason: 'CLASSIFIER_INVALID_RESPONSE', detail });
  if (!raw || typeof raw !== 'object') return bad('Yanıt nesne değil');
  const r = raw as Record<string, unknown>;
  const label = r.label as QuestionCategory;
  if (!CATEGORIES.includes(label)) return bad(`Bilinmeyen etiket: ${String(r.label)}`);
  const probsRaw = r.probs as Record<string, unknown> | undefined;
  if (!probsRaw || typeof probsRaw !== 'object') return bad('probs eksik');
  const probs = {} as Record<QuestionCategory, number>;
  for (const c of CATEGORIES) {
    if (!isProb(probsRaw[c])) return bad(`Geçersiz olasılık: ${c}`);
    probs[c] = probsRaw[c] as number;
  }
  const sum = CATEGORIES.reduce((s, c) => s + probs[c], 0);
  if (Math.abs(sum - 1) > 0.01) return bad(`Olasılık toplamı 1 değil (${sum.toFixed(3)})`);
  const argmax = CATEGORIES.reduce((a, b) => (probs[b] > probs[a] ? b : a));
  if (probs[argmax] - probs[label] > 1e-6) return bad('Etiket en yüksek olasılıklı sınıf değil');
  if (!isProb(r.p_genel) || Math.abs((r.p_genel as number) - probs.genel) > 1e-4) return bad('p_genel tutarsız');
  if (typeof r.model_version !== 'string' || !r.model_version) return bad('model_version eksik');
  return {
    ok: true,
    label,
    probs,
    pGenel: probs.genel,
    modelVersion: r.model_version,
    serviceTau: isProb(r.tau) ? (r.tau as number) : 1,
    latencyMs: typeof r.latency_ms === 'number' ? r.latency_ms : 0,
  };
}

export class BerturkClassifier {
  constructor(
    private baseUrl: string = config.classifierUrl,
    private timeoutMs: number = config.classifierTimeoutMs,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async classify(text: string): Promise<ClassifierResult> {
    if (!config.classifierEnabled) {
      return { ok: false, reason: 'CLASSIFIER_DISABLED', detail: 'TOKENAI_CLASSIFIER_ENABLED=false' };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        return { ok: false, reason: 'CLASSIFIER_INVALID_RESPONSE', detail: `HTTP ${res.status}` };
      }
      return parseClassifierResponse(await res.json());
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { ok: false, reason: 'CLASSIFIER_TIMEOUT', detail: `${this.timeoutMs} ms içinde yanıt yok` };
      }
      return { ok: false, reason: 'CLASSIFIER_UNAVAILABLE', detail: err?.cause?.code || err?.message || 'bağlantı hatası' };
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<{ ok: boolean; modelVersion: string | null }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/health`, { signal: ctrl.signal });
      if (!res.ok) return { ok: false, modelVersion: null };
      const body = (await res.json()) as { status?: string; model_version?: string };
      return { ok: body.status === 'ok', modelVersion: body.model_version ?? null };
    } catch {
      return { ok: false, modelVersion: null };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const berturkClassifier = new BerturkClassifier();
