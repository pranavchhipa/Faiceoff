"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { type ReactNode } from "react";

// The old flow had a 7th `lora_review` step where we queued a Replicate
// training run. The current generation pipeline uses reference photos as
// face anchors directly (no per-creator training), so that step is gone.
// The `/dashboard/onboarding/lora-review` route still exists as a redirect
// shim for any legacy creator whose `onboarding_step` is still `lora_review`.
const STEPS = [
  { key: "identity", label: "Identity", path: "/dashboard/onboarding/identity" },
  { key: "instagram", label: "Instagram", path: "/dashboard/onboarding/instagram" },
  { key: "categories", label: "Categories", path: "/dashboard/onboarding/categories" },
  { key: "compliance", label: "Compliance", path: "/dashboard/onboarding/compliance" },
  { key: "consent", label: "Consent", path: "/dashboard/onboarding/consent" },
  { key: "photos", label: "Photos", path: "/dashboard/onboarding/photos" },
  { key: "pricing", label: "Pricing", path: "/dashboard/onboarding/pricing" },
] as const;

function getActiveIndex(pathname: string): number {
  const idx = STEPS.findIndex((s) => pathname.startsWith(s.path));
  return idx === -1 ? 0 : idx;
}

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeIndex = getActiveIndex(pathname);

  return (
    <div className="max-w-5xl">
      {/* ── Progress Stepper ── */}
      <nav className="mb-10" aria-label="Onboarding progress">
        {/* Desktop stepper */}
        <ol className="hidden md:flex items-center gap-0">
          {STEPS.map((step, i) => {
            const isComplete = i < activeIndex;
            const isCurrent = i === activeIndex;

            return (
              <li key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`
                      flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-600 transition-colors
                      ${isComplete ? "bg-[var(--color-gold)] text-white" : ""}
                      ${isCurrent ? "border-2 border-[var(--color-gold)] bg-[var(--color-gold)]/10 text-[var(--color-gold)]" : ""}
                      ${!isComplete && !isCurrent ? "border border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-400)]" : ""}
                    `}
                  >
                    {isComplete ? <Check className="size-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-[10px] font-500 whitespace-nowrap ${
                      isCurrent
                        ? "text-[var(--color-gold)]"
                        : isComplete
                          ? "text-[var(--color-ink)]"
                          : "text-[var(--color-neutral-400)]"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-1.5 mt-[-18px] h-0.5 flex-1 rounded-full transition-colors ${
                      i < activeIndex
                        ? "bg-[var(--color-gold)]"
                        : "bg-[var(--color-neutral-200)]"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Mobile stepper */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-600 text-[var(--color-ink)]">
              Step {activeIndex + 1} of {STEPS.length}
            </span>
            <span className="text-sm font-500 text-[var(--color-gold)]">
              {STEPS[activeIndex]?.label}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--color-neutral-200)]">
            <div
              className="h-full rounded-full bg-[var(--color-gold)] transition-all duration-300"
              style={{ width: `${((activeIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </nav>

      {/* ── Step Content ── */}
      {children}
    </div>
  );
}
