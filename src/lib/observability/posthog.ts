import posthog from 'posthog-js';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let initialized = false;

/**
 * Get the PostHog browser client. Initializes on first call.
 * Only call this in browser/client components.
 */
export function getPostHogClient() {
  if (typeof window === 'undefined') {
    throw new Error('PostHog client can only be used in the browser');
  }

  if (!initialized) {
    posthog.init(getEnvVar('NEXT_PUBLIC_POSTHOG_KEY'), {
      api_host: getEnvVar('NEXT_PUBLIC_POSTHOG_HOST'),
      person_profiles: 'identified_only',
      capture_pageview: false, // Manually controlled in Next.js App Router
    });
    initialized = true;
  }

  return posthog;
}
