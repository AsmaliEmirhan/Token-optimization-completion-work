import fs from 'node:fs';
import path from 'node:path';

// Attempt to load .env if available
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile(envPath);
  }
} catch (e) {
  // Silent catch if .env cannot be loaded
}

export interface AppConfig {
  classifierUrl: string;
  classifierTau: number;
  classifierEnabled: boolean;
  mysqlHost: string;
  mysqlPort: number;
  mysqlUser: string;
  mysqlPassword: string;
  mysqlDatabase: string;
  l1Enabled: boolean;
  l1TtlSeconds: number;
  l1PolicyVersion: string;
  classifierTimeoutMs: number;
}

// Varsayılan τ = 0.90: 2. eğitim turunun insan test setinde kararsız hatalar bu eşikle eleniyor.
const DEFAULT_TAU = 0.9;
const parseTau = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TAU;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 1.01 ? n : DEFAULT_TAU;
};

export const config: AppConfig = {
  // Yerel BERTurk servisi (classifier-service/server.py). Yalnızca 127.0.0.1.
  classifierUrl: (process.env.TOKENAI_CLASSIFIER_URL || 'http://127.0.0.1:8765').trim().replace(/\/+$/, ''),
  // Önbellek eşiği: genel ve p(genel) >= τ ise önbelleğe alınır. 1.01 = hiçbir şey önbelleğe alınmaz.
  classifierTau: parseTau(process.env.TOKENAI_CLASSIFIER_TAU),
  classifierEnabled: process.env.TOKENAI_CLASSIFIER_ENABLED !== 'false',
  mysqlHost: (process.env.MYSQL_HOST || '127.0.0.1').trim(),
  mysqlPort: Number(process.env.MYSQL_PORT) || 3306,
  mysqlUser: (process.env.MYSQL_USER || 'root').trim(),
  mysqlPassword: process.env.MYSQL_PASSWORD !== undefined ? process.env.MYSQL_PASSWORD : '',
  mysqlDatabase: (process.env.MYSQL_DATABASE || 'tokenai_db').trim(),
  l1Enabled: process.env.TOKENAI_L1_ENABLED !== 'false',
  // Kayıt geçerlilik süresi (sn). 0 = süresiz: kayıtlar MySQL'de kalıcı olarak durur (varsayılan).
  l1TtlSeconds: Math.max(0, Number(process.env.TOKENAI_L1_TTL_SECONDS) || 0),
  // Politika sürümü anahtara girer. v2 = BERTurk sınıflandırıcı (Gemini dönemindeki v1 kayıtları kullanılmaz).
  l1PolicyVersion: (process.env.TOKENAI_L1_POLICY_VERSION || 'v2').trim(),
  classifierTimeoutMs: Number(process.env.TOKENAI_CLASSIFIER_TIMEOUT_MS) || 2000,
};
