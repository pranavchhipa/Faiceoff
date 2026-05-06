"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, MapPin, ArrowRight, FileCheck } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman & Nicobar Islands","Chandigarh","Dadra & Nagar Haveli and Daman & Diu",
  "Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry",
];

const DRAFT_KEY = "fco:onboarding:identity";

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveDraft(data: object) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* noop */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
}

export default function IdentityPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const draft = typeof window !== "undefined" ? loadDraft() : null;

  const [fullName, setFullName] = useState(draft?.fullName ?? "");
  const [gender, setGender] = useState<string>(draft?.gender ?? "");
  const [dobDay, setDobDay] = useState(draft?.dobDay ?? "");
  const [dobMonth, setDobMonth] = useState(draft?.dobMonth ?? "");
  const [dobYear, setDobYear] = useState(draft?.dobYear ?? "");
  const [city, setCity] = useState(draft?.city ?? "");
  const [state, setState] = useState(draft?.state ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-save draft on every change
  useEffect(() => {
    saveDraft({ fullName, gender, dobDay, dobMonth, dobYear, city, state });
  }, [fullName, gender, dobDay, dobMonth, dobYear, city, state]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!gender) {
      setError("Please select your gender — it's required for accurate likeness generation.");
      return;
    }

    if (!dobDay || !dobMonth || !dobYear) {
      setError("Please enter your complete date of birth.");
      return;
    }

    // Validate age ≥ 18
    const dob = new Date(Number(dobYear), Number(dobMonth) - 1, Number(dobDay));
    const age = new Date().getFullYear() - dob.getFullYear();
    const hadBirthdayThisYear =
      new Date() >= new Date(new Date().getFullYear(), dob.getMonth(), dob.getDate());
    const actualAge = hadBirthdayThisYear ? age : age - 1;
    if (actualAge < 18) {
      setError("You must be at least 18 years old to join Faiceoff.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: metaError } = await supabase.auth.updateUser({
        data: {
          full_legal_name: fullName,
          date_of_birth: `${dobYear}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`,
          city,
          state,
          kyc_id_type: idType,
        },
      });

      if (metaError) throw metaError;

      const res = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "instagram",
          gender,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update step");
      }

      clearDraft();
      router.push("/dashboard/onboarding/instagram");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      {draft && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-3 py-2 text-xs text-[var(--color-primary)] font-500">
          <FileCheck className="size-3.5 shrink-0" />
          Draft restored — your previous answers have been saved.
        </div>
      )}

      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-secondary)] px-3 py-1 text-xs font-600 text-[var(--color-muted-foreground)] mb-3">
          <User className="size-3.5" />
          Identity Verification
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-foreground)] mb-1">
          Tell us about yourself
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          This helps us match AI-generated images to your actual appearance. All data is encrypted and DPDP-compliant.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="fullName">Full legal name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted-foreground)]" />
            <Input
              id="fullName"
              type="text"
              required
              placeholder="As on your government ID"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="pl-10 rounded-[var(--radius-input)]"
            />
          </div>
        </div>

        {/* Gender — pill picker */}
        <div className="space-y-2">
          <Label>Gender</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "non_binary", label: "Non-binary" },
              { value: "prefer_not_to_say", label: "Prefer not to say" },
            ].map((opt) => {
              const selected = gender === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGender(opt.value)}
                  className={`rounded-[var(--radius-pill)] px-4 py-2 text-sm font-600 transition-colors ${
                    selected
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "bg-[var(--color-secondary)] text-[var(--color-foreground)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Used so AI-generated images match your actual appearance. Required for accurate likeness.
          </p>
        </div>

        {/* DOB — 3 dropdowns */}
        <div className="space-y-2">
          <Label>Date of birth</Label>
          <div className="grid grid-cols-3 gap-3">
            <select
              value={dobDay}
              onChange={(e) => setDobDay(e.target.value)}
              required
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </select>
            <select
              value={dobMonth}
              onChange={(e) => setDobMonth(e.target.value)}
              required
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Month</option>
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </select>
            <select
              value={dobYear}
              onChange={(e) => setDobYear(e.target.value)}
              required
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Year</option>
              {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 18 - i).map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* City + State */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted-foreground)]" />
              <Input
                id="city"
                type="text"
                required
                placeholder="e.g. Mumbai"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="pl-10 rounded-[var(--radius-input)]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <select
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              className="w-full h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>


        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500">
            {error}
          </p>
        )}

        <div className="pt-4">
          <Button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 rounded-[var(--radius-button)] h-11 px-8 font-600"
          >
            {saving ? (
              <div className="size-4 animate-spin rounded-full border-2 border-[var(--color-primary-foreground)]/30 border-t-[var(--color-primary-foreground)]" />
            ) : (
              <>
                Continue
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
