"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FOLLOWER_RANGES = [
  { value: "",         label: "Select range" },
  { value: "1000",    label: "Under 1K" },
  { value: "5000",    label: "1K – 10K  (Nano)" },
  { value: "25000",   label: "10K – 50K  (Micro)" },
  { value: "75000",   label: "50K – 100K  (Mid)" },
  { value: "250000",  label: "100K – 500K  (Macro)" },
  { value: "750000",  label: "500K – 1M  (Mega)" },
  { value: "1500000", label: "1M+  (Celebrity)" },
] as const;

function IgIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none">
      <defs>
        <radialGradient id="ig-g" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#ffd600" />
          <stop offset="30%" stopColor="#ff6930" />
          <stop offset="60%" stopColor="#e2436f" />
          <stop offset="90%" stopColor="#c837ab" />
          <stop offset="100%" stopColor="#6559ca" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-g)" />
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1" fill="white" />
    </svg>
  );
}

function YtIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
      <polygon points="10,8.5 10,15.5 16,12" fill="white" />
    </svg>
  );
}

const SELECT_CLS = "w-full h-9 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] pl-9 pr-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 appearance-none";

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
    if (!res.ok) throw new Error((await res.json()).error || "Failed to update step");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
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
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      await advanceStep();
      router.push("/dashboard/onboarding/categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setSaving(false); }
  }

  async function handleSkip() {
    setSaving(true); setError(null);
    try { await advanceStep(); router.push("/dashboard/onboarding/categories"); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setSaving(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}
      className="max-w-lg"
    >
      <div className="mb-6">
        <h2 className="font-display text-xl font-800 tracking-tight text-[var(--color-foreground)]">
          Your social presence
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          Brands discover you through your reach. All fields optional.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Instagram */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <IgIcon />
            <span className="text-sm font-700 text-[var(--color-foreground)]">Instagram</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-600 text-[var(--color-muted-foreground)]">@</span>
              <Input placeholder="yourhandle" value={igHandle}
                onChange={(e) => setIgHandle(e.target.value.replace(/^@/, ""))}
                className="pl-7 h-9 text-sm" />
            </div>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
              <select value={igFollowers} onChange={(e) => setIgFollowers(e.target.value)} className={SELECT_CLS}>
                {FOLLOWER_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)]" />

        {/* YouTube */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <YtIcon />
            <span className="text-sm font-700 text-[var(--color-foreground)]">YouTube</span>
            <span className="text-[10px] font-600 text-[var(--color-muted-foreground)] bg-[var(--color-secondary)] px-2 py-0.5 rounded-full">Optional</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-600 text-[var(--color-muted-foreground)]">@</span>
              <Input placeholder="yourchannel" value={ytHandle}
                onChange={(e) => setYtHandle(e.target.value.replace(/^@/, ""))}
                className="pl-7 h-9 text-sm" />
            </div>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
              <select value={ytSubscribers} onChange={(e) => setYtSubscribers(e.target.value)} className={SELECT_CLS}>
                {FOLLOWER_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)]" />

        {/* Bio */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-600 text-[var(--color-foreground)]">Bio</span>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">{bio.length}/300</span>
          </div>
          <textarea
            maxLength={300} rows={3}
            placeholder="Tell brands what you're about..."
            value={bio} onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={saving}
            className="h-9 gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-6 text-sm font-700 text-[var(--color-primary-foreground)] hover:opacity-90">
            {saving
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary-foreground)]/30 border-t-[var(--color-primary-foreground)]" />
              : <>Continue <ArrowRight className="h-4 w-4" /></>}
          </Button>
          <button type="button" disabled={saving} onClick={handleSkip}
            className="text-sm font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors disabled:opacity-50">
            Skip
          </button>
        </div>
      </form>
    </motion.div>
  );
}
