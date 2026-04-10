"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

const STEP_ROUTES: Record<string, string> = {
  identity: "/dashboard/onboarding/identity",
  instagram: "/dashboard/onboarding/instagram",
  categories: "/dashboard/onboarding/categories",
  compliance: "/dashboard/onboarding/compliance",
  consent: "/dashboard/onboarding/consent",
  photos: "/dashboard/onboarding/photos",
  lora_review: "/dashboard/onboarding/lora-review",
  pricing: "/dashboard/onboarding/pricing",
  complete: "/dashboard/onboarding/complete",
};

export default function OnboardingRedirectPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !user) return;

    async function fetchStep() {
      const res = await fetch("/api/onboarding/current-step");

      if (!res.ok) {
        // If fetch fails, start at identity
        router.replace("/dashboard/onboarding/identity");
        return;
      }

      const { step } = await res.json();

      if (!step) {
        // No creator row yet, start at identity
        router.replace("/dashboard/onboarding/identity");
        return;
      }

      const route = STEP_ROUTES[step] ?? "/dashboard/onboarding/identity";
      router.replace(route);
    }

    fetchStep().catch(() => {
      setError("Failed to load onboarding progress.");
    });
  }, [user, isLoading, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-24">
      <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
    </div>
  );
}
