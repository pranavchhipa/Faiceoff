"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AtSign, FileText, ArrowRight, SkipForward, Users } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FOLLOWER_RANGES = [
  { value: "",      label: "Select range" },
  { value: "1000",  label: "Under 1K" },
  { value: "5000",  label: "1K - 10K (Nano)" },
  { value: "25000", label: "10K - 50K (Micro)" },
  { value: "75000", label: "50K - 100K (Mid)" },
  { value: "250000", label: "100K - 500K (Macro)" },
  { value: "750000", label: "500K - 1M (Mega)" },
  { value: "1500000", label: "1M+ (Celebrity)" },
] as const;

export default function InstagramPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [handle, setHandle] = useState("");
  const [followers, setFollowers] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advanceStep() {
    const res = await fetch("/api/onboarding/update-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "categories" }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || "Failed to update step");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      const saveRes = await fetch("/api/onboarding/save-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram_handle: handle,
          instagram_followers: followers ? parseInt(followers, 10) : null,
          bio: bio || null,
        }),
      });

      if (!saveRes.ok) {
        const body = await saveRes.json();
        throw new Error(body.error || "Failed to save Instagram details");
      }

      await advanceStep();
      router.push("/dashboard/onboarding/categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    setError(null);
    try {
      await advanceStep();
      router.push("/dashboard/onboarding/categories");
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
          <AtSign className="size-3.5" />
          Social Profile
        </div>
        <h2 className="text-2xl font-700 text-[var(--color-ink)] mb-1">
          Connect your Instagram
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)]">
          Help brands discover you. Your handle and follower count will be visible on your creator profile.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Instagram Handle */}
        <div className="space-y-2">
          <Label htmlFor="handle">Instagram handle</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-500 text-[var(--color-neutral-400)]">
              @
            </span>
            <Input
              id="handle"
              type="text"
              placeholder="yourhandle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="pl-8 rounded-[var(--radius-input)]"
            />
          </div>
        </div>

        {/* Followers Count */}
        <div className="space-y-2">
          <Label htmlFor="followers">Follower count</Label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-neutral-400)]" />
            <select
              id="followers"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              className="w-full h-10 rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-white pl-10 pr-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold)]/20 appearance-none"
            >
              {FOLLOWER_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[var(--color-neutral-400)]">
            Helps brands filter creators by reach. You can update this later.
          </p>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">
            Bio
            <span className="ml-2 text-xs font-400 text-[var(--color-neutral-400)]">
              {bio.length}/500
            </span>
          </Label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 size-4 text-[var(--color-neutral-400)]" />
            <textarea
              id="bio"
              maxLength={500}
              rows={4}
              placeholder="Tell brands what you're about..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-white px-3 py-2 pl-10 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-[var(--color-neutral-400)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold)]/20 resize-none"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[var(--radius-input)] px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button
            type="submit"
            disabled={saving}
            className="bg-[var(--color-gold)] text-white hover:bg-[var(--color-gold-hover)] rounded-[var(--radius-button)] h-11 px-8 font-600"
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
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={handleSkip}
            className="rounded-[var(--radius-button)] h-11 px-6 font-500 text-[var(--color-neutral-500)]"
          >
            <SkipForward className="size-4" />
            Skip for now
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
