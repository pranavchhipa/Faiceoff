"use client";

/**
 * AnalyticsProvider — browser analytics, mounted once at the root.
 *
 * Until now nothing tracked the browser at all. `getPostHogClient()` existed
 * but was never called from anywhere, and it would have thrown if it had
 * been: it read config through `process.env[name]`, a dynamic lookup that
 * Next's webpack DefinePlugin cannot inline, so both values were `undefined`
 * in the bundle. It also set `capture_pageview: false` with no manual
 * pageview call to replace it. Three separate reasons for zero data.
 *
 * This provider:
 *  - captures first-touch attribution before anything else can overwrite it
 *  - initialises PostHog with STATIC env access
 *  - sends a pageview on every App Router navigation (the SDK's automatic
 *    pageview only fires on hard loads, so client-side routes were invisible)
 */

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { captureAttribution } from "@/lib/analytics/attribution";

// Static access — see the note above. Do NOT refactor these into a helper
// that takes the name as a variable.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let started = false;

function startPostHog(): boolean {
  if (started) return true;
  if (!POSTHOG_KEY) return false;
  posthog.init(POSTHOG_KEY, {
    // `us.posthog.com` is the DASHBOARD host and silently drops events;
    // ingestion lives on `us.i.posthog.com`. Fall back to the correct one
    // rather than trusting a possibly-wrong env value.
    api_host: POSTHOG_HOST?.includes(".i.posthog.com")
      ? POSTHOG_HOST
      : "https://us.i.posthog.com",
    person_profiles: "identified_only",
    // Pageviews are sent manually below — App Router navigations don't
    // trigger the SDK's automatic one.
    capture_pageview: false,
    capture_pageleave: true,
  });
  started = true;
  return true;
}

export function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Before anything else: the landing referrer/UTM is only readable on the
    // very first page, and only once.
    captureAttribution();
    startPostHog();
  }, []);

  useEffect(() => {
    if (!startPostHog()) return;
    const qs = searchParams?.toString();
    posthog.capture("$pageview", {
      $current_url: `${window.location.origin}${pathname}${qs ? `?${qs}` : ""}`,
    });
  }, [pathname, searchParams]);

  return null;
}
