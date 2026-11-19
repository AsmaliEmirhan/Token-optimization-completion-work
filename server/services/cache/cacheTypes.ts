export type QuestionCategory = 'genel' | 'kisisel' | 'degisken' | 'sanatsal';

export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export interface ClassificationDecision {
  kategori: QuestionCategory;
  kisisel_bagimlilik: boolean;
  degisken_bilgi_gerekiyor: boolean;
  yeni_cikti_bekleniyor: boolean;
  model_bagimliligi: boolean;
  tekrar_kullanilabilir: boolean;
  karar_belirsiz: boolean;
  gerekce: string;
}

export interface CachedL1Entry {
  version: string;
  key: string;
  prompt: string;
  content: string;
  sourceProvider: string;
  sourceModel: string;
  originalUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    totalTokens: number | null;
  };
  classification: ClassificationDecision;
  createdAt: number;
  ttlSeconds: number;
  /** Kaydın geçerlilik sonu (epoch ms). Bu andan sonra kayıt HIT vermez. */
  expiresAt?: number | null;
  /** Kaydı onaylayan sınıflandırıcı model sürümü */
  classifierVersion?: string | null;
  /** Kayıt anındaki p(genel) */
  confidence?: number | null;
}

export interface CacheLookupResult {
  hit: boolean;
  status: CacheStatus;
  /** status=BYPASS ise nedeni */
  bypassReason?: 'L1_DISABLED' | 'DB_UNAVAILABLE';
  entry?: CachedL1Entry;
  latencyMs: number;
}
