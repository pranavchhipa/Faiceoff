import * as Sentry from '@sentry/nextjs';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function initSentry() {
  Sentry.init({
    dsn: getEnvVar('NEXT_PUBLIC_SENTRY_DSN'),
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV ?? 'development',
    enabled: process.env.NODE_ENV === 'production',
    // Tag every event with the deployment commit so alerts are bisectable
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    // Drop noisy expected errors that don't need on-call paging
    ignoreErrors: [
      'AbortError',
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
      // User cancelled image upload
      'AbortError: The user aborted a request.',
    ],
    // Attach common platform tags to every event so dashboards filter cleanly
    initialScope: {
      tags: {
        platform: 'faiceoff',
        runtime: typeof window === 'undefined' ? 'server' : 'browser',
      },
    },
  });
}

/**
 * Wrap a critical-path function so any throw is captured to Sentry with
 * route + phase tags before re-throwing. Use sparingly — only on flows
 * where we want guaranteed observability (payment, generation, payout).
 */
export async function withSentryContext<T>(
  ctx: { route: string; phase: string; extra?: Record<string, unknown> },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: ctx.route, phase: ctx.phase },
      extra: ctx.extra,
    });
    throw err;
  }
}

export { Sentry };
