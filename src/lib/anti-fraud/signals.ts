/**
 * Anti-fraud signal detection for Faiceoff.
 *
 * Detects suspicious patterns in brand and creator behaviour.
 * Each signal has a severity level and an evidence payload for audit logging.
 *
 * Signals are intentionally independent — a single check failure should never
 * block the operation; instead, the calling layer decides based on the returned
 * set of signals whether to block, flag, or allow.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fraud signal identifiers. */
export type FraudSignal =
  | 'velocity_burst'        // > 10 gens in 5 min from same brand
  | 'low_diversity'         // same brief repeated ≥ 3 times
  | 'rapid_credit_topup'   // 3+ topups in 1 h
  | 'kyc_age_low'           // creator KYC-linked account < 24 h old and generating
  | 'multi_account_pattern'; // same IP, different brand accounts

export interface SignalCheck {
  signal: FraudSignal;
  severity: 'low' | 'medium' | 'high';
  detected: boolean;
  evidence?: unknown;
}

export interface SignalInput {
  brandId?: string;
  creatorId?: string;
  ip?: string;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class FraudError extends Error {
  readonly code: string;
  constructor(message: string, code = 'FRAUD_ERROR') {
    super(message);
    this.name = 'FraudError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Signal: velocity_burst
// > 10 generations created by brand in last 5 min
// ---------------------------------------------------------------------------

async function checkVelocityBurst(brandId: string): Promise<SignalCheck> {
  const signal: FraudSignal = 'velocity_burst';

  try {
    const admin = createAdminClient();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { count, error } = await admin
      .from('generations')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .gte('created_at', fiveMinutesAgo);

    if (error) {
      return { signal, severity: 'high', detected: false, evidence: { error: error.message } };
    }

    const generationCount = count ?? 0;
    const BURST_THRESHOLD = 10;

    return {
      signal,
      severity: 'high',
      detected: generationCount > BURST_THRESHOLD,
      evidence: { count: generationCount, threshold: BURST_THRESHOLD, window: '5m' },
    };
  } catch (err) {
    // Never throw — return undetected with error evidence
    return {
      signal,
      severity: 'high',
      detected: false,
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// Signal: low_diversity
// Same brief repeated ≥ 3 times in last 24 h for same brand
// ---------------------------------------------------------------------------

async function checkLowDiversity(brandId: string): Promise<SignalCheck> {
  const signal: FraudSignal = 'low_diversity';

  try {
    const admin = createAdminClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from('generations')
      .select('structured_brief')
      .eq('brand_id', brandId)
      .gte('created_at', oneDayAgo);

    if (error || !data) {
      return { signal, severity: 'low', detected: false };
    }

    // Count brief occurrences by serialized value
    const briefCounts = new Map<string, number>();
    for (const row of data) {
      const key = JSON.stringify(row.structured_brief);
      briefCounts.set(key, (briefCounts.get(key) ?? 0) + 1);
    }

    const REPEAT_THRESHOLD = 3;
    let maxRepeat = 0;
    for (const count of briefCounts.values()) {
      if (count > maxRepeat) maxRepeat = count;
    }

    return {
      signal,
      severity: 'low',
      detected: maxRepeat >= REPEAT_THRESHOLD,
      evidence: { maxRepeatCount: maxRepeat, threshold: REPEAT_THRESHOLD, window: '24h' },
    };
  } catch (err) {
    return {
      signal,
      severity: 'low',
      detected: false,
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// Signal: rapid_credit_topup
// 3+ credit top-ups in last 1 h for same brand/user
// ---------------------------------------------------------------------------

async function checkRapidCreditTopup(brandId: string): Promise<SignalCheck> {
  const signal: FraudSignal = 'rapid_credit_topup';

  try {
    const admin = createAdminClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await admin
      .from('credit_top_ups' as never)
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .gte('created_at', oneHourAgo);

    if (error) {
      return { signal, severity: 'medium', detected: false, evidence: { error: (error as { message: string }).message } };
    }

    const topupCount = count ?? 0;
    const TOPUP_THRESHOLD = 3;

    return {
      signal,
      severity: 'medium',
      detected: topupCount >= TOPUP_THRESHOLD,
      evidence: { count: topupCount, threshold: TOPUP_THRESHOLD, window: '1h' },
    };
  } catch (err) {
    return {
      signal,
      severity: 'medium',
      detected: false,
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// Signal: kyc_age_low
// Creator account < 24 h old and attempting to use the platform
// ---------------------------------------------------------------------------

async function checkKycAgeLow(creatorId: string): Promise<SignalCheck> {
  const signal: FraudSignal = 'kyc_age_low';

  try {
    const admin = createAdminClient();

    const { data: creator, error } = await admin
      .from('creators')
      .select('created_at, kyc_status')
      .eq('id', creatorId)
      .maybeSingle();

    if (error || !creator) {
      return { signal, severity: 'medium', detected: false };
    }

    const accountAgeMs = Date.now() - new Date(creator.created_at).getTime();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const isNew = accountAgeMs < TWENTY_FOUR_HOURS_MS;

    return {
      signal,
      severity: 'medium',
      detected: isNew,
      evidence: {
        created_at: creator.created_at,
        account_age_hours: (accountAgeMs / (60 * 60 * 1000)).toFixed(2),
        kyc_status: creator.kyc_status,
      },
    };
  } catch (err) {
    return {
      signal,
      severity: 'medium',
      detected: false,
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// Signal: multi_account_pattern
// Same IP, different brand accounts making generations in the last 1 h
// ---------------------------------------------------------------------------

async function checkMultiAccountPattern(ip: string): Promise<SignalCheck> {
  const signal: FraudSignal = 'multi_account_pattern';

  try {
    const admin = createAdminClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Check audit_log for sign-in events from the same IP across multiple users
    const { data, error } = await admin
      .from('audit_log' as never)
      .select('metadata')
      .eq('action', 'sign_in')
      .gte('created_at', oneHourAgo);

    if (error || !data) {
      return { signal, severity: 'high', detected: false };
    }

    const rows = data as Array<{ metadata: unknown }>;
    const usersFromIp = new Set<string>();
    for (const row of rows) {
      const meta = row.metadata as Record<string, unknown> | null;
      if (meta && typeof meta === 'object' && meta.ip === ip && typeof meta.user_id === 'string') {
        usersFromIp.add(meta.user_id);
      }
    }

    const MULTI_ACCOUNT_THRESHOLD = 2;
    return {
      signal,
      severity: 'high',
      detected: usersFromIp.size > MULTI_ACCOUNT_THRESHOLD,
      evidence: { uniqueUsersFromIp: usersFromIp.size, threshold: MULTI_ACCOUNT_THRESHOLD, window: '1h' },
    };
  } catch (err) {
    return {
      signal,
      severity: 'high',
      detected: false,
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run all applicable fraud signal checks for the given input.
 *
 * Each signal is checked independently; failures in one do not affect others.
 * Returns all checked signals with their detection status.
 */
export async function checkSignals(input: SignalInput): Promise<SignalCheck[]> {
  const checks: Array<Promise<SignalCheck>> = [];

  if (input.brandId) {
    checks.push(checkVelocityBurst(input.brandId));
    checks.push(checkLowDiversity(input.brandId));
    checks.push(checkRapidCreditTopup(input.brandId));
  }

  if (input.creatorId) {
    checks.push(checkKycAgeLow(input.creatorId));
  }

  if (input.ip) {
    checks.push(checkMultiAccountPattern(input.ip));
  }

  // All checks run concurrently; individual failures are contained within each check
  return Promise.all(checks);
}
