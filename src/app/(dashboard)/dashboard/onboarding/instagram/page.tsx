"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AtSign, ArrowRight, SkipForward, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FOLLOWER_RANGES = [
  { value: "",        label: "Select range" },
  { value: "1000",   label: "Under 1K" },
  { value: "5000",   label: "1K – 10K (Nano)" },
  { value: "25000",  label: "10K – 50K (Micro)" },
  { value: "75000",  label: "50K – 100K (Mid)" },
  { value: "250000", label: "100K – 500K (Macro)" },
  { value: "750000", label: "500K – 1M (Mega)" },
  { value: "1500000",label: "1M+ (Celebrity)" },
] as const;

export default function InstagramPage() {
  const router = useRouter();

  const [igHandle, setIgHandle] = useState("");
  const [igFollowers, setIgFollowers] = useState("");
  const [ytHandle, setYtHandle] = useState("");
  const [ytSubscribers, setYtSubscribers] = useState("");
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
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/save-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram_handle: igHandle || null,
          instagram_followers: igFollowers ? Number(igFollowers) : null,
          youtube_handle: ytHandle || null,
          youtube_subscribers: ytSubscribers ? Number(ytSubscribers) : null,
          bio: bio || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to save social profiles");
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-secondary)] px-3 py-1 text-[11px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
          <AtSign className="h-3.5 w-3.5" />
          Social Profiles
        </span>
        <h2 className="mt-3 font-display text-2xl font-800 tracking-tight text-[var(--color-foreground)]">
          Your social presence
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Brands discover you through your reach. Add whichever platforms you use — both are optional.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Instagram */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-4">
          <div className="flex items-center gap-2">
            <AtSign className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={2.4} />
            <p className="font-700 text-[14px] text-[var(--color-foreground)]">Instagram</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ig-handle" className="text-[var(--color-foreground)]">Handle</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-600 text-[var(--color-muted-foreground)]">@</span>
              <Input
                id="ig-handle"
                type="text"
                placeholder="yourhandle"
                value={igHandle}
                onChange={(e) => setIgHandle(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ig-followers" className="text-[var(--color-foreground)]">Followers</Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <select
                id="ig-followers"
                value={igFollowers}
                onChange={(e) => setIgFollowers(e.target.value)}
                className="w-full h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] pl-10 pr-3 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 appearance-none"
              >
                {FOLLOWER_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* YouTube */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-red-500" strokeWidth={2.2} />
            <p className="font-700 text-[14px] text-[var(--color-foreground)]">YouTube</p>
            <span className="rounded-full bg-[var(--color-secondary)] px-2 py-0.5 text-[10px] font-600 text-[var(--color-muted-foreground)]">Optional</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt-handle" className="text-[var(--color-foreground)]">Channel handle</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-600 text-[var(--color-muted-foreground)]">@</span>
              <Input
                id="yt-handle"
                type="text"
                placeholder="yourchannel"
                value={ytHandle}
                onChange={(e) => setYtHandle(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt-subscribers" className="text-[var(--color-foreground)]">Subscribers</Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <select
                id="yt-subscribers"
                value={ytSubscribers}
                onChange={(e) => setYtSubscribers(e.target.value)}
                className="w-full h-10 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] pl-10 pr-3 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 appearance-none"
              >
                {FOLLOWER_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="bio" className="text-[var(--color-foreground)]">Bio</Label>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">{bio.length}/500</span>
          </div>
          <textarea
            id="bio"
            maxLength={500}
            rows={3}
            placeholder="Tell brands what you're about..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row pt-2">
          <Button
            type="submit"
            disabled={saving}
            className="h-11 gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-8 font-700 text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary-foreground)]/30 border-t-[var(--color-primary-foreground)]" />
            ) : (
              <>Continue <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={handleSkip}
            className="h-11 gap-2 rounded-[var(--radius-button)] px-6 font-600 text-[var(--color-muted-foreground)]"
          >
            <SkipForward className="h-4 w-4" />
            Skip for now
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
