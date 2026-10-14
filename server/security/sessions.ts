import crypto from 'node:crypto';
import type { Request, Response } from 'express';

export interface BrowserSession {
  partitionId: string;
  credentialRevision: number;
  expiresAt: number;
  apiKeys: Map<string, string>;
  models: Map<string, { id: string; name: string }[]>;
}

export interface SessionOptions {
  ttlMs?: number;
  maxSessions?: number;
  secure?: boolean;
  now?: () => number;
}

export class SessionStore {
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly now: () => number;
  private readonly timer: ReturnType<typeof setInterval>;
  readonly ttlMs: number;
  readonly maxSessions: number;
  readonly secure: boolean;

  constructor(options: SessionOptions = {}) {
    this.ttlMs = options.ttlMs ?? 8 * 60 * 60 * 1000;
    this.maxSessions = options.maxSessions ?? 1000;
    this.secure = options.secure ?? false;
    this.now = options.now ?? Date.now;
    for (const value of [this.ttlMs, this.maxSessions]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID_SESSION_LIMIT');
    }
    // Süresi dolan anahtarları trafik olmasa da bellekten serbest bırakıyoruz.
    this.timer = setInterval(() => this.prune(), Math.min(this.ttlMs, 60_000));
    this.timer.unref();
  }

  resolve(req: Request, res: Response): BrowserSession | null {
    this.prune();
    const secure = this.secure || req.secure;
    const name = secure ? '__Host-tokenai-session' : 'tokenai-session';
    const values = (req.headers.cookie ?? '').split(';').map(value => value.trim())
      .filter(value => value.startsWith(name + '='));
    const token = values.length === 1 ? values[0].slice(name.length + 1) : '';
    if (/^[a-f0-9]{64}$/.test(token)) {
      const existing = this.sessions.get(this.hash(token));
      if (existing) return existing;
    }
    if (this.sessions.size >= this.maxSessions) return null;
    // İstemcinin verdiği bilinmeyen kimlik benimsenmez: oturum sabitlemesini engelliyoruz.
    const secret = crypto.randomBytes(32).toString('hex');
    const session: BrowserSession = {
      partitionId: crypto.randomUUID(), credentialRevision: 0,
      expiresAt: this.now() + this.ttlMs, apiKeys: new Map(), models: new Map(),
    };
    this.sessions.set(this.hash(secret), session);
    // Max-Age/Expires yok: tarayıcı oturum çerezi. Sunucuda ayrıca mutlak 8 saat sınırı var.
    res.cookie(name, secret, { httpOnly: true, sameSite: 'strict', secure, path: '/' });
    return session;
  }

  dispose(): void {
    clearInterval(this.timer);
    this.sessions.clear();
  }

  private hash(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  private prune(): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= this.now()) this.sessions.delete(id);
    }
  }
}
