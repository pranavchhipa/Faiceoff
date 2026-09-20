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

  // us.posthog.com is the DASHBOARD host and silently drops events; ingestion
  // lives on us.i.posthog.com. The browser provider already refuses to trust
  // this env var (see analytics-provider.tsx) — the server client was reading
  // it raw, so every server-side event, signup_completed included, was posted
  // to a host that throws them away. The old default, app.posthog.com, is a
  // dashboard host too.
  const rawHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const host = rawHost?.includes(".i.posthog.com") ? rawHost : "https://us.i.posthog.com";

  _client = new PostHog(apiKey, {
    host,
    // flushAt: 1, not 20. On Vercel the function is frozen the moment it
    // returns its response, so a batch waiting for a 20-event threshold or a
    // 10s timer is simply never sent. Most routes here fire a single event and
    // return immediately — batching guaranteed they were lost.
    flushAt: 1,
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
