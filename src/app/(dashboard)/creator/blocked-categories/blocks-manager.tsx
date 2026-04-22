"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ShieldOff } from "lucide-react";

interface BlockedCategory {
  category: string;
  blocked_at: string;
  reason: string | null;
}

const CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "alcohol",   label: "Alcohol",   emoji: "🍺" },
  { id: "tobacco",   label: "Tobacco",   emoji: "🚬" },
  { id: "gambling",  label: "Gambling",  emoji: "🎰" },
  { id: "political", label: "Political", emoji: "🏛️" },
  { id: "religious", label: "Religious", emoji: "⛪" },
  { id: "adult",     label: "Adult",     emoji: "🔞" },
  { id: "crypto",    label: "Crypto",    emoji: "₿" },
  { id: "weapons",   label: "Weapons",   emoji: "🔫" },
  { id: "pharma",    label: "Pharma",    emoji: "💊" },
];

export default function BlocksManager({
  initialBlocked,
}: {
  initialBlocked: BlockedCategory[];
}) {
  // map: category → blocked record (or null if not blocked)
  const [blockedMap, setBlockedMap] = useState<Record<string, BlockedCategory | null>>(() => {
    const m: Record<string, BlockedCategory | null> = {};
    for (const cat of CATEGORIES) {
      const found = initialBlocked.find((b) => b.category === cat.id);
      m[cat.id] = found ?? null;
    }
    return m;
  });

  const [reasons, setReasons] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const b of initialBlocked) {
      m[b.category] = b.reason ?? "";
    }
    return m;
  });

  const [loading, setLoading] = useState<Record<string, boolean>>({});

  async function handleToggle(catId: string, checked: boolean) {
    const prev = blockedMap[catId];
    // Optimistic
    setLoading((l) => ({ ...l, [catId]: true }));
    setBlockedMap((m) => ({
      ...m,
      [catId]: checked
        ? { category: catId, blocked_at: new Date().toISOString(), reason: reasons[catId] ?? null }
        : null,
    }));

    try {
      if (checked) {
        const res = await fetch("/api/creator/blocked-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: catId,
            reason: reasons[catId] || undefined,
          }),
        });
        if (!res.ok) throw new Error("block failed");
        const json = (await res.json()) as { category: string; blocked_at: string };
        setBlockedMap((m) => ({
          ...m,
          [catId]: { category: json.category, blocked_at: json.blocked_at, reason: reasons[catId] ?? null },
        }));
        toast.success(`${catId} blocked`);
      } else {
        const res = await fetch(
          `/api/creator/blocked-categories/${encodeURIComponent(catId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("unblock failed");
        setBlockedMap((m) => ({ ...m, [catId]: null }));
        toast.success(`${catId} unblocked`);
      }
    } catch {
      // Revert
      setBlockedMap((m) => ({ ...m, [catId]: prev }));
      toast.error(`Failed to ${checked ? "block" : "unblock"} ${catId}`);
    } finally {
      setLoading((l) => ({ ...l, [catId]: false }));
    }
  }

  async function handleReasonBlur(catId: string) {
    if (!blockedMap[catId]) return; // not blocked, no-op
    // Re-post to update reason (upsert idempotent)
    try {
      await fetch("/api/creator/blocked-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: catId,
          reason: reasons[catId] || undefined,
        }),
      });
    } catch {
      // silent — reason update is non-critical
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-3xl"
    >
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-on-surface)]">
          Blocked categories
        </h1>
        <p className="mt-1 text-sm text-[var(--color-outline)] max-w-xl">
          Brands cannot generate content matching your blocked categories. You will be
          auto-rejected from requests in these categories.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-2 text-xs text-[var(--color-neutral-500)]">
        <ShieldOff className="size-3.5" />
        <span>
          {Object.values(blockedMap).filter(Boolean).length} of {CATEGORIES.length} categories
          blocked
        </span>
      </div>

      {/* 3x3 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map((cat, i) => {
          const isBlocked = Boolean(blockedMap[cat.id]);
          const isLoading = Boolean(loading[cat.id]);

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className={`rounded-[var(--radius-card)] border p-4 transition-all ${
                isBlocked
                  ? "border-[var(--color-blush-deep)] bg-[var(--color-blush)]/60"
                  : "border-[var(--color-neutral-200)] bg-white hover:border-[var(--color-neutral-300)]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl leading-none" role="img" aria-label={cat.label}>
                    {cat.emoji}
                  </span>
                  <span className="text-sm font-semibold text-[var(--color-ink)] capitalize">
                    {cat.label}
                  </span>
                </div>

                {/* Toggle switch */}
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isBlocked}
                    disabled={isLoading}
                    onChange={(e) => handleToggle(cat.id, e.target.checked)}
                  />
                  <div
                    className={`h-5 w-9 rounded-full transition-colors peer-checked:bg-[var(--color-blush-deep)] bg-[var(--color-neutral-200)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent-gold)] relative ${isLoading ? "opacity-50" : ""}`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        isBlocked ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </div>
                </label>
              </div>

              {/* Reason textarea — shown when blocked */}
              {isBlocked && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <textarea
                    value={reasons[cat.id] ?? ""}
                    onChange={(e) =>
                      setReasons((r) => ({ ...r, [cat.id]: e.target.value }))
                    }
                    onBlur={() => handleReasonBlur(cat.id)}
                    placeholder="Reason (optional, max 200 chars)"
                    maxLength={200}
                    rows={2}
                    className="mt-2 w-full rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-white px-3 py-1.5 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-accent-gold)] focus:ring-1 focus:ring-[var(--color-accent-gold)]/30 resize-none"
                  />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
