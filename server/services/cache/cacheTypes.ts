import type { UsageTokens } from '../cost/costEngine.js';

export const CACHE_SCHEMA_VERSION = 3;
export const CACHE_POLICY_VERSION = 'hybrid-rules-v1';

export type CacheScope = 'shared' | 'user_private' | 'session_private';
export type ValidationStatus = 'approved' | 'rejected' | 'uncertain';

export interface SafetyValidationResult {
  status: ValidationStatus;
  reasonCode: string;
  validatorVersion: string;
}

export interface CacheScopeDecision {
  scope: CacheScope | null;
  eligible: boolean;
  reasonCode: string;
  policyVersion: string;
  requiresAdditionalValidation: boolean;
  category: string | null;
  sharing: SafetyValidationResult;
}

// Bu kimliği yalnızca gelecekteki doğrulanmış sunucu auth katmanı sağlayabilir.
// HTTP gövdesindeki userId veya anonim oturum, bu sözleşmenin yerine geçmez.
export interface AuthenticatedIdentity {
  authenticated: true;
  issuer: string;
  subject: string;
  cacheRevision: number;
}

export interface CacheScopeBinding {
  scope: CacheScope;
  scopeId: string | null;
}

export interface CacheDecision {
  requestId: string;
  eligibilityResult: CacheScopeDecision;
  sharingResult: SafetyValidationResult;
  reasonCode: string;
  validatorVersion: string;
  timestamp: number;
}

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
  scope: CacheScope;
  scopeId: string | null;
  policyVersion: string;
  toolContext: StableExternalContext | null;
  retrievalContext: StableExternalContext | null;
}

// Bellekte birlikte tutulan bu mantıksal kayıtlar ileride ayrı answer/cache tablolarına ayrılabilir.
export interface AnswerRecord {
  answerId: string;
  content: string;
  sourceProvider: string;
  sourceModel: string;
  sourceRequestId: string;
  sourceUsage: UsageTokens;
  provenance: { kind: 'provider'; validatedAt: number; validatorVersion: string };
}

export interface ExactCacheEntry extends AnswerRecord, CacheScopeBinding {
  id: string;
  key: string;
  createdAt: number;
  expiresAt: number;
  cacheType: 'exact';
  policyVersion: string;
  validationStatus: ValidationStatus;
  decision: CacheDecision;
}

export interface CacheInvalidation {
  scope?: CacheScope;
  scopeId?: string;
  policyVersion?: string;
  incompatiblePolicyVersion?: string;
}

export interface ExactCacheStore {
  get(key: string, now?: number): ExactCacheEntry | null;
  set(entry: ExactCacheEntry): boolean;
  delete(key: string): boolean;
  clear(): void;
  invalidate(filter: CacheInvalidation): number;
  readonly size: number;
  readonly generation: number;
}
