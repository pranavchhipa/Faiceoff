"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";

// Maps the DB onboarding_step value → where to redirect the creator
const STEP_ROUTES: Record<string, string> = {
  identity:    "/dashboard/onboarding/identity",
  instagram:   "/dashboard/onboarding/instagram",
  categories:  "/dashboard/onboarding/categories",
  compliance:  "/dashboard/onboarding/compliance",
  consent:     "/dashboard/onboarding/consent",
  photos:      "/dashboard/onboarding/photos",
  pricing:     "/dashboard/onboarding/pricing",
  complete:    "/dashboard/onboarding/complete",
  // Legacy step — forward to pricing (save-photos used to leave step="lora_review")
  lora_review: "/dashboard/onboarding/pricing",
};

/**
 * Redirect shim that sends the creator to their current onboarding step.
 */
export default function OnboardingRedirectPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (didRedirectRef.current) return;
    if (isLoading) return;

    if (!user) {
      const timeoutId = setTimeout(() => {
        if (didRedirectRef.current) return;
        didRedirectRef.current = true;
        router.replace("/login?redirect=/dashboard/onboarding");
      }, 4000);
      return () => clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    const fetchTimeoutId = setTimeout(() => controller.abort(), 8000);

    async function fetchStep() {
      try {
        const res = await fetch("/api/onboarding/current-step", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
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
        <p className="max-w-md text-center text-sm text-red-500">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              didRedirectRef.current = false;
              setError(null);
              router.replace("/dashboard/onboarding");
            }}
            className="rounded-[var(--radius-button)] bg-[var(--color-primary)] px-5 py-2 text-sm font-600 text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/login?redirect=/dashboard/onboarding"
            className="rounded-[var(--radius-button)] border border-[var(--color-border)] px-5 py-2 text-sm font-600 text-[var(--color-foreground)] no-underline hover:bg-[var(--color-secondary)]"
          >
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-24">
      <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
    </div>
  );
}
