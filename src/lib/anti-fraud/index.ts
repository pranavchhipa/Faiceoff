/**
 * Faiceoff Anti-Fraud Library
 *
 * Signal detection + rate limiting for abuse protection.
 *
 * Usage:
 *   const signals = await checkSignals({ brandId: 'xxx', ip: '1.2.3.4' });
 *   const highSeverity = signals.filter(s => s.detected && s.severity === 'high');
 *
 *   const limiter = brandGenerationLimiter();
 *   const { allowed } = await checkRateLimit(limiter, brandId);
 *   if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
 */

export { checkSignals, FraudError } from './signals';
export type { FraudSignal, SignalCheck, SignalInput } from './signals';

export {
  brandGenerationLimiter,
  brandTopupLimiter,
  creatorPayoutLimiter,
  checkRateLimit,
} from './rate-limiter';
