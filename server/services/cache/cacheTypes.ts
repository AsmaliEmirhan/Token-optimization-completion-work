import type { UsageTokens } from '../cost/costEngine.js';

export const CACHE_SCHEMA_VERSION = 2;

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerationParameters {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  seed?: number;
}

export interface SecurityScope {
  // Çerezdeki gizli oturum belirteci değil, sunucunun ayrı ürettiği cache bölümü.
  partitionId: string;
  credentialRevision: number;
}

export interface StableExternalContext {
  // Şema izi korunur, ancak bu sürüm HTTP'de harici bağlamı bütünüyle reddeder.
  cacheSafe: boolean;
  fingerprint: string;
}

export interface ExactCacheKeyInput {
  schemaVersion: number;
  provider: string;
  model: string;
  message: string;
  systemInstructions: string | null;
  conversation: ConversationMessage[];
  generationParameters: GenerationParameters;
  securityScope: SecurityScope;
  toolContext: StableExternalContext | null;
  retrievalContext: StableExternalContext | null;
}

export interface ExactCacheEntry {
  id: string;
  key: string;
  answerId: string;
  content: string;
  sourceProvider: string;
  sourceModel: string;
  sourceRequestId: string;
  sourceUsage: UsageTokens;
  createdAt: number;
  expiresAt: number;
  cacheType: 'exact';
}

export interface ExactCacheStore {
  get(key: string, now?: number): ExactCacheEntry | null;
  set(entry: ExactCacheEntry): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
  readonly generation: number;
}

export interface CachePolicyDecision {
  eligible: boolean;
  reason: string | null;
}
