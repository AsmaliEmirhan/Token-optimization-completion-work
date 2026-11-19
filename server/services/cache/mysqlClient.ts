import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { config } from '../../config/env.js';
import type { CachedL1Entry } from './cacheTypes.js';

export interface ICacheStorage {
  isAvailable(): boolean;
  get(key: string): Promise<CachedL1Entry | null>;
  set(entry: CachedL1Entry): Promise<boolean>;
  del(key: string): Promise<boolean>;
  flushall?(): Promise<boolean>;
  quit(): Promise<void>;
}

class MySQLStorageService implements ICacheStorage {
  private pool: Pool | null = null;
  private connected: boolean = false;
  private warnedOffline: boolean = false;
  private lastConnectAttempt: number = 0;
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly V2_COLUMNS: Array<[string, string]> = [
    ['expires_at', 'BIGINT NULL'],
    ['policy_version', 'VARCHAR(32) NULL'],
    ['classifier_version', 'VARCHAR(64) NULL'],
    ['confidence', 'DOUBLE NULL'],
  ];

  private async migrate(pool: Pool): Promise<void> {
    const [cols] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'l1_exact_cache'`,
      [config.mysqlDatabase]
    );
    const existing = new Set(cols.map((c) => String(c.COLUMN_NAME).toLowerCase()));
    for (const [name, def] of MySQLStorageService.V2_COLUMNS) {
      if (!existing.has(name)) {
        await pool.query(`ALTER TABLE l1_exact_cache ADD COLUMN ${name} ${def}`);
        console.log(`[MySQL] Migration: l1_exact_cache.${name} eklendi.`);
      }
    }
    const [idx] = await pool.query<RowDataPacket[]>(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'l1_exact_cache' AND INDEX_NAME = 'idx_expires_at'`,
      [config.mysqlDatabase]
    );
    if (idx.length === 0) {
      await pool.query('CREATE INDEX idx_expires_at ON l1_exact_cache (expires_at)');
    }
  }

  /**
   * Süre yönetimi. expires_at NULL = süresiz kayıt (varsayılan, TOKENAI_L1_TTL_SECONDS=0).
   * TTL kapalıyken önceki sürümün verdiği bitiş tarihleri kaldırılır; kayıtlar kalıcı olur.
   * TTL açıksa yalnızca bitiş tarihi geçmiş kayıtlar silinir.
   */
  async purgeExpired(): Promise<number> {
    if (!this.pool) return 0;
    if (config.l1TtlSeconds <= 0) {
      await this.pool.query('UPDATE l1_exact_cache SET expires_at = NULL WHERE expires_at IS NOT NULL');
      return 0;
    }
    const [res] = await this.pool.query<any>(
      'DELETE FROM l1_exact_cache WHERE expires_at IS NOT NULL AND expires_at <= ?',
      [Date.now()]
    );
    const n = res?.affectedRows || 0;
    if (n > 0) console.log(`[MySQL] Süresi dolan ${n} önbellek kaydı silindi.`);
    return n;
  }

  private async init(): Promise<void> {
    if (this.connected && this.pool !== null) return;
    const now = Date.now();
    if (now - this.lastConnectAttempt < 3000) return;
    this.lastConnectAttempt = now;

    try {
      // Step 1: Connect to server and ensure database exists
      const serverConn = await mysql.createConnection({
        host: config.mysqlHost,
        port: config.mysqlPort,
        user: config.mysqlUser,
        password: config.mysqlPassword,
        connectTimeout: 3000,
      });

      await serverConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${config.mysqlDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await serverConn.end();

      // Step 2: Create connection pool with database selected
      this.pool = mysql.createPool({
        host: config.mysqlHost,
        port: config.mysqlPort,
        user: config.mysqlUser,
        password: config.mysqlPassword,
        database: config.mysqlDatabase,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });

      // Step 3: Ensure table exists
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS l1_exact_cache (
          cache_key VARCHAR(128) PRIMARY KEY,
          prompt TEXT NOT NULL,
          content MEDIUMTEXT NOT NULL,
          source_provider VARCHAR(64) NOT NULL,
          source_model VARCHAR(64) NOT NULL,
          input_tokens INT DEFAULT 0,
          output_tokens INT DEFAULT 0,
          thinking_tokens INT DEFAULT 0,
          total_tokens INT DEFAULT 0,
          category VARCHAR(32) NOT NULL,
          gerekce TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          INDEX idx_category (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Step 4: Migration — v2 sütunları (MySQL ve MariaDB'de çalışır; IF NOT EXISTS yerine information_schema)
      await this.migrate(this.pool);
      await this.purgeExpired();
      if (!this.purgeTimer) {
        this.purgeTimer = setInterval(() => { this.purgeExpired().catch(() => {}); }, 60 * 60 * 1000);
        this.purgeTimer.unref?.();
      }

      this.connected = true;
      this.warnedOffline = false;
      console.log(`[MySQL] Connected to MySQL database "${config.mysqlDatabase}" on ${config.mysqlHost}:${config.mysqlPort}. L1 önbellek hazır (${config.l1TtlSeconds > 0 ? `TTL ${config.l1TtlSeconds} sn` : 'kayıtlar süresiz'}).`);
    } catch (err: any) {
      this.connected = false;
      if (!this.warnedOffline) {
        console.warn(`[MySQL] MySQL is unreachable or not started (${err.code || err.message}). Cache will run in BYPASS mode until MySQL is started in XAMPP/Laragon.`);
        this.warnedOffline = true;
      }
    }
  }

  isAvailable(): boolean {
    if (!this.connected) {
      this.init().catch(() => {});
    }
    return this.connected && this.pool !== null;
  }

  async get(key: string): Promise<CachedL1Entry | null> {
    if (!this.connected) await this.init();
    if (!this.pool || !this.connected) return null;

    try {
      const now = Date.now();
      const [rows] = await this.pool.query<RowDataPacket[]>(
        'SELECT * FROM l1_exact_cache WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > ?) LIMIT 1',
        [key, now]
      );

      if (!rows || rows.length === 0) return null;

      const row = rows[0];
      // Bozuk kayıt reddi: içerik boş ya da kategori genel değilse kullanılmaz ve silinir
      if (typeof row.content !== 'string' || row.content.trim().length === 0 || row.category !== 'genel') {
        console.warn('[MySQL] Bozuk/uygunsuz önbellek kaydı reddedildi ve silindi:', String(key).slice(0, 30));
        await this.pool.query('DELETE FROM l1_exact_cache WHERE cache_key = ?', [key]).catch(() => {});
        return null;
      }
      const entry: CachedL1Entry = {
        version: row.policy_version || 'v1',
        key: row.cache_key,
        prompt: row.prompt,
        content: row.content,
        sourceProvider: row.source_provider,
        sourceModel: row.source_model,
        originalUsage: {
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          thinkingTokens: row.thinking_tokens,
          totalTokens: row.total_tokens,
        },
        classification: {
          kategori: row.category as any,
          kisisel_bagimlilik: false,
          degisken_bilgi_gerekiyor: false,
          yeni_cikti_bekleniyor: false,
          model_bagimliligi: false,
          tekrar_kullanilabilir: true,
          karar_belirsiz: false,
          gerekce: row.gerekce || '',
        },
        createdAt: Number(row.created_at),
        ttlSeconds: config.l1TtlSeconds,
        expiresAt: row.expires_at !== null && row.expires_at !== undefined ? Number(row.expires_at) : null,
        classifierVersion: row.classifier_version ?? null,
        confidence: row.confidence ?? null,
      };

      return entry;
    } catch (err: any) {
      if (!this.warnedOffline) {
        console.warn('[MySQL] GET failed for key:', key, err.message);
      }
      return null;
    }
  }

  async set(entry: CachedL1Entry): Promise<boolean> {
    if (!this.connected) await this.init();
    if (!this.pool || !this.connected) return false;

    try {
      const now = Date.now();
      await this.pool.query(
        // Yarış durumu: aynı anahtar eşzamanlı yazılırsa PRIMARY KEY tek kaydı garanti eder;
        // ON DUPLICATE KEY ile son yazan geçerlilik süresini yeniler.
        `INSERT INTO l1_exact_cache (
          cache_key, prompt, content, source_provider, source_model,
          input_tokens, output_tokens, thinking_tokens, total_tokens,
          category, gerekce, created_at, updated_at,
          expires_at, policy_version, classifier_version, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          content = VALUES(content),
          source_provider = VALUES(source_provider),
          source_model = VALUES(source_model),
          updated_at = VALUES(updated_at),
          expires_at = VALUES(expires_at),
          classifier_version = VALUES(classifier_version),
          confidence = VALUES(confidence);`,
        [
          entry.key,
          entry.prompt,
          entry.content,
          entry.sourceProvider,
          entry.sourceModel,
          entry.originalUsage?.inputTokens || 0,
          entry.originalUsage?.outputTokens || 0,
          entry.originalUsage?.thinkingTokens || 0,
          entry.originalUsage?.totalTokens || 0,
          entry.classification.kategori,
          entry.classification.gerekce,
          entry.createdAt || now,
          now,
          entry.expiresAt ?? null,
          entry.version,
          entry.classifierVersion ?? null,
          entry.confidence ?? null,
        ]
      );
      return true;
    } catch (err: any) {
      console.warn('[MySQL] SET failed for key:', entry.key, err.message);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.connected) await this.init();
    if (!this.pool || !this.connected) return false;

    try {
      const [res] = await this.pool.query<any>(
        'DELETE FROM l1_exact_cache WHERE cache_key = ?',
        [key]
      );
      return res?.affectedRows > 0;
    } catch (err: any) {
      return false;
    }
  }

  async flushall(): Promise<boolean> {
    if (!this.connected) await this.init();
    if (!this.pool || !this.connected) return false;

    try {
      await this.pool.query('TRUNCATE TABLE l1_exact_cache');
      return true;
    } catch (err) {
      return false;
    }
  }

  async quit(): Promise<void> {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (e) {
        // ignore
      }
      this.pool = null;
      this.connected = false;
    }
  }
}

/**
 * In-memory Mock Storage implementation for automated tests
 */
export class InMemoryStorageMock implements ICacheStorage {
  private store: Map<string, CachedL1Entry> = new Map();

  isAvailable(): boolean {
    return true;
  }

  async get(key: string): Promise<CachedL1Entry | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(JSON.stringify(item));
  }

  async set(entry: CachedL1Entry): Promise<boolean> {
    this.store.set(entry.key, JSON.parse(JSON.stringify(entry)));
    return true;
  }

  async del(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async flushall(): Promise<boolean> {
    this.store.clear();
    return true;
  }

  async quit(): Promise<void> {
    this.store.clear();
  }
}

export const mysqlStorageService: ICacheStorage = new MySQLStorageService();
