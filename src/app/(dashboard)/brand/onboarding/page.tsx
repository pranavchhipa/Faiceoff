"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Building2, Globe, Tag, CheckCircle2, Loader2 } from "lucide-react";

const INDUSTRIES = [
  "Beauty & Personal Care", "Food & Beverage", "Fashion & Apparel",
  "Health & Wellness", "Tech & Electronics", "Home & Lifestyle",
  "Sports & Fitness", "Travel & Hospitality", "Education", "Finance",
  "Automotive", "Other",
] as const;

type Step = 1 | 2 | 3;

interface FormData {
  company_name: string;
  industry: string;
  website_url: string;
  gst_number: string;
}

export default function BrandOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>({ company_name: "", industry: "", website_url: "", gst_number: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleFinish() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/brand-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          industry: form.industry,
          website_url: form.website_url.trim() || null,
          gst_number: form.gst_number.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Save failed");
      }
      setStep(3);
      setTimeout(() => router.push("/brand/discover"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const STEPS = [
    { n: 1, label: "Company" },
    { n: 2, label: "Industry" },
    { n: 3, label: "Done" },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-700 transition-all ${
              step >= s.n ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
            }`}>
              {step > s.n ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
            </div>
            <span className={`text-[11px] font-600 ${step >= s.n ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-foreground)]"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-[var(--color-border)]" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-primary)]">Step 1 of 2</p>
            <h1 className="mt-1 font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)]">
              Tell us about your company
            </h1>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              This appears on your brand profile and invoices.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                  Company name *
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => set("company_name", e.target.value)}
                    placeholder="Acme India Pvt Ltd"
                    maxLength={200}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] py-3 pl-10 pr-4 text-[14px] text-[var(--color-foreground)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                  Website
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                  <input
                    type="url"
                    value={form.website_url}
                    onChange={(e) => set("website_url", e.target.value)}
                    placeholder="https://yourcompany.com"
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] py-3 pl-10 pr-4 text-[14px] text-[var(--color-foreground)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!form.company_name.trim()}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3.5 text-[15px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition active:scale-[0.98] disabled:opacity-50"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-primary)]">Step 2 of 2</p>
            <h1 className="mt-1 font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)]">
              What&apos;s your industry?
            </h1>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Helps us match you with the right creators.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind}
                  type="button"
                  onClick={() => set("industry", ind)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-600 transition-all ${
                    form.industry === ind
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40"
                  }`}
                >
                  <Tag className="h-3 w-3" />
                  {ind}
                </button>
              ))}
            </div>

            <div className="mt-6">
              <label className="mb-1 block font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                GST number (optional, for B2B invoicing)
              </label>
              <input
                type="text"
                value={form.gst_number}
                onChange={(e) => set("gst_number", e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-3 font-mono text-[13px] uppercase text-[var(--color-foreground)] focus:border-[var(--color-primary)]/50 focus:outline-none"
              />
            </div>

            {error && <p className="mt-3 text-[12px] text-red-500">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-[13px] font-600 text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                disabled={saving || !form.industry}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 text-[15px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="h-4.5 w-4.5" /> Finish setup</>}
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="py-12 text-center"
          >
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-500" />
            <h2 className="font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)]">
              You&apos;re all set!
            </h2>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Taking you to Discover creators…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
