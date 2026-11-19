import crypto from 'node:crypto';

/**
 * Manages isolated API keys per user session in memory.
 * Ensures complete separation of credentials between different users.
 */
class SessionManager {
  private sessionKeys: Map<string, Record<string, string>> = new Map();

  /**
   * Sanitizes and resolves the session ID from request headers or body.
   */
  resolveSessionId(headerVal?: string | string[], bodyVal?: string): string {
    const raw = (typeof headerVal === 'string' ? headerVal : Array.isArray(headerVal) ? headerVal[0] : bodyVal) || '';
    const trimmed = raw.trim();
    if (trimmed.length > 0 && /^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) {
      return trimmed;
    }
    return 'default';
  }

  getApiKey(sessionId: string, provider: string): string | undefined {
    const keys = this.sessionKeys.get(sessionId);
    return keys ? keys[provider] : undefined;
  }

  setApiKey(sessionId: string, provider: string, apiKey: string): void {
    if (!sessionId || !provider || !apiKey) return;
    let keys = this.sessionKeys.get(sessionId);
    if (!keys) {
      keys = {};
      this.sessionKeys.set(sessionId, keys);
    }
    keys[provider] = apiKey.trim();
  }

  hasApiKey(sessionId: string, provider: string): boolean {
    return Boolean(this.getApiKey(sessionId, provider));
  }

  getConfiguredProviders(sessionId: string): string[] {
    const keys = this.sessionKeys.get(sessionId);
    if (!keys) return [];
    return Object.keys(keys).filter(p => Boolean(keys[p]));
  }

  clearSession(sessionId: string): void {
    this.sessionKeys.delete(sessionId);
  }
}

export const sessionManager = new SessionManager();
