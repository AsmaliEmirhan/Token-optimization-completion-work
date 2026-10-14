import type { UsageTokens } from '../cost/costEngine.js';

export const CACHE_SCHEMA_VERSION = 1;

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
  tenantId?: string;
  userId?: string;
  sessionId?: string;
}

export interface StableExternalContext {
  cacheSafe: true;
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
  set(entry: ExactCacheEntry): void;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
}

export interface CachePolicyDecision {
  eligible: boolean;
  reason: string | null;
}
