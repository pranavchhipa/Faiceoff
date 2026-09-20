import posthog from "posthog-js";

/**
 * Browser PostHog handle.
 *
 * Initialisation now lives in `components/providers/analytics-provider.tsx`,
 * which is mounted once at the root. This module only hands back the SDK for
 * ad-hoc `capture()` / `identify()` calls from client components.
 *
 * The previous version initialised here and read config via
 * `process.env[name]` — a dynamic lookup webpack cannot inline, so both
 * values were `undefined` in the bundle and the call would have thrown. It
 * was also never imported anywhere, so the app shipped with no browser
 * analytics at all.
 */
export function getPostHogClient() {
  if (typeof window === "undefined") {
    throw new Error("PostHog browser client used on the server");
  }
  return posthog;
}
