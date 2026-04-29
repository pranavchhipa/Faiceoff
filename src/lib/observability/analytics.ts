/**
 * Server-side analytics — thin PostHog wrapper.
 *
 * Singleton client (PostHog batches in-memory and flushes on shutdown / N
 * events / N seconds). Calls are fire-and-forget; never throw and never
 * block the request path. If POSTHOG_KEY isn't set we silently no-op so
 * dev environments don't pollute the prod project.
 *
 * Usage:
 *   import { track } from "@/lib/observability/analytics";
 *   track("generation_created", { generation_id, brand_id, cost_paise });
 *
 * Distinct ID: pass `distinctId` when known (user.id), else falls back to
 * `anonymous` and PostHog stitches via session-id later.
 */

import { PostHog } from "posthog-node";

let _client: PostHog | null = null;
let _initialised = false;

function getClient(): PostHog | null {
  if (_initialised) return _client;
  _initialised = true;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    return null; // silently disabled
  }

  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

  _client = new PostHog(apiKey, {
    host,
    flushAt: 20,
    flushInterval: 10_000,
  });
  return _client;
}

/** Server-side event. Fire-and-forget. */
export function track(
  event: string,
  properties: Record<string, unknown> = {},
  distinctId: string | null = null,
): void {
  try {
    const client = getClient();
    if (!client) return;
    client.capture({
      distinctId: distinctId ?? "anonymous",
      event,
      properties,
    });
  } catch {
    // analytics must never break the request
  }
}

/** Identify a user (links anonymous events). Fire-and-forget. */
export function identify(
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  try {
    const client = getClient();
    if (!client) return;
    client.identify({ distinctId, properties });
  } catch {
    // ignore
  }
}
