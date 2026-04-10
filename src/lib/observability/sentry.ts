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
  });
}

export { Sentry };
