"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";

const STEP_ROUTES: Record<string, string> = {
  identity: "/dashboard/onboarding/identity",
  instagram: "/dashboard/onboarding/instagram",
  categories: "/dashboard/onboarding/categories",
  compliance: "/dashboard/onboarding/compliance",
  consent: "/dashboard/onboarding/consent",
  photos: "/dashboard/onboarding/photos",
  // Backward compat: legacy creators whose DB row still says `lora_review`
  // land on the lora-review page which then auto-advances them to pricing.
  // New sign-ups skip this step entirely — save-photos now writes "pricing".
  lora_review: "/dashboard/onboarding/lora-review",
  pricing: "/dashboard/onboarding/pricing",
  complete: "/dashboard/onboarding/complete",
};

/**
 * Redirect shim that sends the creator to their current onboarding step.
 *
 * Historic bug: the previous version silently returned early from the effect
 * when `user` was null and never recovered — users saw an infinite spinner
 * when their client-side Supabase session hadn't yet populated (e.g. right
 * after verify-otp) or when /api/onboarding/current-step hung. We now:
 *   1) Wait for `isLoading` to flip false
 *   2) If user is still null after a 4s grace period, send them to /login
 *   3) Use an 8s AbortController timeout on the API call so the spinner
 *      never hangs forever
 *   4) Surface a recoverable error state (retry + go-to-login links)
 *      instead of a spinning div of doom
 */
export default function OnboardingRedirectPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (didRedirectRef.current) return;
    if (isLoading) return;

    // If the browser client still hasn't picked up a session after auth
    // finished loading, give it a short grace window (the cookie set by
    // verify-otp can take a tick to be visible to createBrowserClient).
    // If it still isn't there, route to /login instead of spinning.
    if (!user) {
      const timeoutId = setTimeout(() => {
        if (didRedirectRef.current) return;
        didRedirectRef.current = true;
        router.replace("/login?redirect=/dashboard/onboarding");
      }, 4000);
      return () => clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    // Hard cap on the current-step fetch so we never leave the user on a
    // spinner if the API is slow or unreachable.
    const fetchTimeoutId = setTimeout(() => controller.abort(), 8000);

    async function fetchStep() {
      try {
        const res = await fetch("/api/onboarding/current-step", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          // 401 most likely — session lost between page load and API call.
          // Anything else: just start from step 1 which is the safest path.
          if (res.status === 401) {
            didRedirectRef.current = true;
            router.replace("/login?redirect=/dashboard/onboarding");
            return;
          }
          didRedirectRef.current = true;
          router.replace("/dashboard/onboarding/identity");
          return;
        }

        const { step } = (await res.json()) as { step: string | null };
        didRedirectRef.current = true;
        router.replace(
          step ? (STEP_ROUTES[step] ?? "/dashboard/onboarding/identity") : "/dashboard/onboarding/identity",
        );
      } catch (err) {
        // AbortError on timeout or network error — show recoverable UI
        if ((err as Error).name === "AbortError") {
          setError(
            "This is taking longer than expected. Please try again or sign in again.",
          );
        } else {
          setError("Failed to load onboarding progress. Please try again.");
        }
      }
    }

    fetchStep();

    return () => {
      clearTimeout(fetchTimeoutId);
      controller.abort();
    };
  }, [user, isLoading, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="max-w-md text-center text-sm text-red-600">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              didRedirectRef.current = false;
              setError(null);
              // Force a re-run of the effect by touching a state — easiest
              // is to navigate to the same URL via replace.
              router.replace("/dashboard/onboarding");
            }}
            className="rounded-[var(--radius-button)] bg-[var(--color-gold)] px-5 py-2 text-sm font-600 text-white hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/login?redirect=/dashboard/onboarding"
            className="rounded-[var(--radius-button)] border border-[var(--color-neutral-200)] px-5 py-2 text-sm font-600 text-[var(--color-ink)] no-underline hover:bg-[var(--color-neutral-50)]"
          >
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-24">
      <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
    </div>
  );
}
