"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Handshake, Loader2, Zap, CheckCircle2, Clock } from "lucide-react";

interface Collab {
  id: string;
  name: string;
  status: string;
  package_tier: string | null;
  package_price_paise: number | null;
  final_images_target: number | null;
  approved_count: number;
  gen_credits_total: number | null;
  gen_credits_used: number;
  counterpart_name: string;
  is_legacy: boolean;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:    { label: "Active",    color: "text-emerald-600", bg: "bg-emerald-500/10", icon: Zap },
  completed: { label: "Completed", color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", icon: CheckCircle2 },
  paused:    { label: "Paused",    color: "text-yellow-600", bg: "bg-yellow-500/10", icon: Clock },
};

const TIER_LABELS: Record<string, string> = { frame: "Frame", feature: "Feature", cover: "Cover" };

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export default function CreatorCollabsPage() {
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/collabs", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { collabs: [] })
      .then((d) => setCollabs(d.collabs ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const active = collabs.filter((c) => c.status === "active");
  const completed = collabs.filter((c) => c.status !== "active");

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Handshake className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Collabs
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            Your Collabs
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Active collaborations with brands — chat, review images, track approvals.
          </p>
        </div>
      </motion.div>

      {collabs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <Handshake className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No collabs yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            When a brand pays for a collab, it will appear here.
          </p>
          <Link
            href="/creator/requests"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)]"
          >
            View requests
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mb-6">
              <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Active — {active.length}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {active.map((c, i) => <CollabCard key={c.id} collab={c} delay={i * 0.05} />)}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Past — {completed.length}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {completed.map((c, i) => <CollabCard key={c.id} collab={c} delay={i * 0.04} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CollabCard({ collab, delay }: { collab: Collab; delay: number }) {
  const statusMeta = STATUS_META[collab.status] ?? STATUS_META.active;
  const StatusIcon = statusMeta.icon;
  const progress = collab.final_images_target
    ? Math.round((collab.approved_count / collab.final_images_target) * 100)
    : null;

  return (
    <motion.div
      variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/creator/collabs/${collab.id}`}
        className="group block rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[0_8px_24px_-8px_rgba(201,169,110,0.25)]"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-[15px] font-800 leading-tight text-[var(--color-foreground)]">
              {collab.name}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
              with {collab.counterpart_name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-700 uppercase ${statusMeta.bg} ${statusMeta.color}`}>
              <StatusIcon className="h-2.5 w-2.5" />
              {statusMeta.label}
            </span>
            {collab.is_legacy && (
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] text-[var(--color-muted-foreground)]">
                Legacy
              </span>
            )}
          </div>
        </div>

        {collab.package_tier && (
          <p className="mb-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
            {TIER_LABELS[collab.package_tier] ?? collab.package_tier}
          </p>
        )}

        {progress !== null && (
          <div>
            <div className="mb-1 flex justify-between font-mono text-[10px] text-[var(--color-muted-foreground)]">
              <span>{collab.approved_count}/{collab.final_images_target} approved</span>
              {collab.gen_credits_total && (
                <span>{collab.gen_credits_total - collab.gen_credits_used} credits left</span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </Link>
    </motion.div>
  );
}
