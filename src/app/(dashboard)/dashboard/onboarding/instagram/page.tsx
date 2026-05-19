"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Users, CheckCircle2, RefreshCcw, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* Follower-count buckets — used ONLY when the creator can't / doesn't want
   to connect via OAuth (Personal IG account fallback). Connected creators
   get the real number from Meta. */
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

function IgIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none">
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

const DRAFT_KEY = "fco:onboarding:socials";
function loadDraft() { try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveDraft(d: object) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {} }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

const SELECT_CLS = "w-full h-9 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-card)] pl-9 pr-3 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 appearance-none";

interface IgStatus {
  verified: boolean;
  handle: string | null;
  followers: number | null;
  account_type: string | null;
  profile_pic_url: string | null;
  media_count: number | null;
  last_synced_at: string | null;
}

const IG_ERROR_MESSAGES: Record<string, string> = {
  personal_account_not_supported:
    "Meta only allows Business or Creator IG accounts to connect. Switch your account type in Instagram → Settings → Account → Switch to Professional Account, then try again. Or enter your handle manually below.",
  state_mismatch:
    "Security check failed (state mismatch). Please try connecting again.",
  missing_code_or_state:
    "Instagram didn't return a valid response. Please try again.",
  save_failed:
    "Connected to Instagram but couldn't save the data. Please try again.",
};

export default function InstagramPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const draft = typeof window !== "undefined" ? loadDraft() : null;
  const [igHandle, setIgHandle] = useState(draft?.igHandle ?? "");
  const [igFollowers, setIgFollowers] = useState(draft?.igFollowers ?? "");
  const [ytHandle, setYtHandle] = useState(draft?.ytHandle ?? "");
  const [ytSubscribers, setYtSubscribers] = useState(draft?.ytSubscribers ?? "");
  const [bio, setBio] = useState(draft?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth state
  const [status, setStatus] = useState<IgStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Pick up callback messages from URL params
  const igError = searchParams.get("ig_error");
  const igConnected = searchParams.get("ig_connected") === "1";

  const fetchStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      const res = await fetch("/api/auth/instagram/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        // If they're verified, hide the manual fallback section
        if (data.verified) setShowManual(false);
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus, igConnected]);

  useEffect(() => {
    saveDraft({ igHandle, igFollowers, ytHandle, ytSubscribers, bio });
  }, [igHandle, igFollowers, ytHandle, ytSubscribers, bio]);

  function handleConnect() {
    // Full-page redirect — IG OAuth needs to leave our origin
    window.location.href = "/api/auth/instagram/start";
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Instagram? Your manual handle (if any) will remain.")) return;
    try {
      const res = await fetch("/api/auth/instagram/disconnect", { method: "POST" });
      if (res.ok) await fetchStatus();
    } catch {}
  }

  async function handleResync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/auth/instagram/sync", { method: "POST" });
      if (res.ok) await fetchStatus();
    } finally {
      setSyncing(false);
    }
  }

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
      // If verified via OAuth, the data is already saved — we only push the
      // manual fields (YouTube, bio override) plus the IG fallback handle if
      // they entered one alongside.
      const payload: Record<string, unknown> = {
        youtube_handle: ytHandle || null,
        youtube_subscribers: ytSubscribers ? Number(ytSubscribers) : null,
        bio: bio || null,
      };
      // Only send IG manual fields if NOT verified (avoid clobbering real data)
      if (!status?.verified) {
        payload.instagram_handle = igHandle || null;
        payload.instagram_followers = igFollowers ? Number(igFollowers) : null;
      }

      const res = await fetch("/api/onboarding/save-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      await advanceStep();
      clearDraft();
      router.push("/dashboard/onboarding/categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setSaving(false); }
  }

  async function handleSkip() {
    setSaving(true); setError(null);
    try { clearDraft(); await advanceStep(); router.push("/dashboard/onboarding/categories"); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setSaving(false); }
  }

  const errorBanner = igError
    ? IG_ERROR_MESSAGES[igError] ?? `Instagram connection failed: ${igError}`
    : null;

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
          Connect Instagram to verify your account. Brands trust verified profiles.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Instagram block */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <IgIcon />
            <span className="text-sm font-700 text-[var(--color-foreground)]">Instagram</span>
            {status?.verified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-emerald-500">
                <CheckCircle2 className="h-3 w-3" />
                Verified
              </span>
            )}
          </div>

          {/* Error banner (from callback) */}
          {errorBanner && (
            <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{errorBanner}</span>
            </div>
          )}

          {statusLoading ? (
            <div className="h-20 animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]" />
          ) : status?.verified ? (
            /* ───── Connected card ───── */
            <div className="rounded-xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.04] to-transparent p-4">
              <div className="flex items-center gap-3">
                {status.profile_pic_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={status.profile_pic_url}
                    alt={status.handle ?? ""}
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-emerald-400/30"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-secondary)]">
                    <IgIcon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-800 text-[var(--color-foreground)]">
                      @{status.handle}
                    </span>
                    {status.account_type && (
                      <span className="rounded-full bg-[var(--color-secondary)] px-1.5 py-px text-[9px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        {status.account_type.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--color-muted-foreground)]">
                    <span>
                      <strong className="font-mono font-700 text-[var(--color-foreground)]">
                        {(status.followers ?? 0).toLocaleString("en-IN")}
                      </strong>{" "}
                      followers
                    </span>
                    {status.media_count !== null && (
                      <span>
                        <strong className="font-mono font-700 text-[var(--color-foreground)]">
                          {status.media_count.toLocaleString("en-IN")}
                        </strong>{" "}
                        posts
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={handleResync}
                    disabled={syncing}
                    title="Refresh from Instagram"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)] disabled:opacity-50"
                  >
                    <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    title="Disconnect"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ───── Not connected — show OAuth CTA + manual fallback toggle ───── */
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleConnect}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-700 text-white shadow-[0_4px_14px_-4px_rgba(226,67,111,0.5)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background:
                    "linear-gradient(135deg, #ffd600 0%, #ff6930 30%, #e2436f 60%, #c837ab 90%, #6559ca 100%)",
                }}
              >
                <IgIcon className="h-5 w-5 brightness-0 invert" />
                <span>Connect Instagram</span>
              </button>
              <p className="text-center text-[11px] text-[var(--color-muted-foreground)]">
                Verifies your account, pulls follower count + bio.{" "}
                <span className="font-600">Business / Creator accounts only.</span>
              </p>

              {/* Manual fallback toggle */}
              {!showManual ? (
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="block w-full text-center text-[11px] font-600 text-[var(--color-muted-foreground)] underline-offset-2 hover:text-[var(--color-foreground)] hover:underline"
                >
                  Personal account? Enter handle manually
                </button>
              ) : (
                <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                      Manual entry (unverified)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowManual(false)}
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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
              )}
            </div>
          )}
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
          {status?.verified && !bio && (
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Pulled from your Instagram bio. Edit if you want to override.
            </p>
          )}
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
