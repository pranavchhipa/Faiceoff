"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, MapPin, Calendar, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function IdentityPage() {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      // Save identity data to auth metadata + users table
      const { error: metaError } = await supabase.auth.updateUser({
        data: {
          full_legal_name: fullName,
          date_of_birth: dob,
          city,
          state,
        },
      });

      if (metaError) throw metaError;

      // Advance onboarding step (admin client syncs display_name)
      const res = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "instagram" }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update step");
      }

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
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
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
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-blush)] px-3 py-1 text-xs font-600 text-[var(--color-ink)] mb-3">
          <User className="size-3.5" />
          Identity Verification
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          Tell us about yourself
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Required for KYC and DPDP Act compliance. Your information is encrypted and stored securely.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full legal name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
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

        <div className="space-y-2">
          <Label htmlFor="dob">Date of birth</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <Input
              id="dob"
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="pl-10 rounded-[var(--radius-input)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
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
            <Input
              id="state"
              type="text"
              required
              placeholder="e.g. Maharashtra"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="rounded-[var(--radius-input)]"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2">
            {error}
          </p>
        )}

        <div className="pt-4">
          <Button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600"
          >
            {saving ? (
              <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
