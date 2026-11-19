import type { ClassificationDecision, QuestionCategory } from '../cache/cacheTypes.js';
import type { ClassifierResult } from './berturkClassifier.js';

/**
 * L1 BYPASS nedenleri. Her BYPASS gerçek nedeniyle raporlanır; farklı hatalar tek etiket altında gizlenmez.
 */
export type BypassReason =
  | 'L1_DISABLED'                  // TOKENAI_L1_ENABLED=false
  | 'CONSENT_DENIED'               // Kullanıcı sınıflandırma iznini kapattı
  | 'CLASSIFIER_DISABLED'          // TOKENAI_CLASSIFIER_ENABLED=false
  | 'CLASSIFIER_UNAVAILABLE'       // Python servisi çalışmıyor / bağlanılamadı
  | 'CLASSIFIER_TIMEOUT'           // Servis süresinde yanıt vermedi
  | 'CLASSIFIER_INVALID_RESPONSE'  // Servis yanıtı eksik/çelişkili
  | 'CATEGORY_KISISEL'
  | 'CATEGORY_DEGISKEN'
  | 'CATEGORY_SANATSAL'
  | 'LOW_CONFIDENCE'               // Genel ama p(genel) < τ
  | 'DB_UNAVAILABLE'               // MySQL'e ulaşılamadı
  | 'RESPONSE_REJECTED'            // Üretilen yanıt ortak kullanıma uygun bulunmadı
  | 'STORE_FAILED';                // Yazma sırasında hata

export const BYPASS_REASON_TEXT: Record<BypassReason, string> = {
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

export interface CacheabilityDecision {
  cacheable: boolean;
  category: QuestionCategory | null;
  confidence: number | null;      // tahmin edilen sınıfın olasılığı
  pGenel: number | null;
  modelVersion: string | null;
  reason: BypassReason | null;    // cacheable=false ise dolu
  decision: ClassificationDecision | null;
}

/**
 * Sınıflandırıcı sonucunu önbellek iznine dönüştürür.
 * Kural: önbelleğe al  <=>  etiket == genel  VE  p(genel) >= τ
 * Hata veya belirsizlikte güvenli varsayılan: önbelleğe alma.
 */
export function decideCacheability(result: ClassifierResult, tau: number): CacheabilityDecision {
  if (!result.ok) {
    return { cacheable: false, category: null, confidence: null, pGenel: null, modelVersion: null, reason: result.reason, decision: null };
  }
  const confidence = result.probs[result.label];
  const isGenel = result.label === 'genel';
  const confident = result.pGenel >= tau;
  const cacheable = isGenel && confident;

  let reason: BypassReason | null = null;
  if (!isGenel) {
    reason = result.label === 'kisisel' ? 'CATEGORY_KISISEL' : result.label === 'degisken' ? 'CATEGORY_DEGISKEN' : 'CATEGORY_SANATSAL';
  } else if (!confident) {
    reason = 'LOW_CONFIDENCE';
  }

  const decision: ClassificationDecision = {
    kategori: result.label,
    kisisel_bagimlilik: result.label === 'kisisel',
    degisken_bilgi_gerekiyor: result.label === 'degisken',
    yeni_cikti_bekleniyor: result.label === 'sanatsal',
    model_bagimliligi: false,
    tekrar_kullanilabilir: cacheable,
    karar_belirsiz: isGenel && !confident,
    gerekce: `BERTurk ${result.modelVersion}: p(genel)=${result.pGenel.toFixed(3)}, τ=${tau}`,
  };

  return { cacheable, category: result.label, confidence, pGenel: result.pGenel, modelVersion: result.modelVersion, reason, decision };
}
