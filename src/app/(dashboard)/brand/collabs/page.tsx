"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Megaphone, Loader2, Plus, Clock, CheckCircle2, Zap,
  ArrowRight, IndianRupee, Image as ImageIcon, FileImage,
  Send, Layers,
} from "lucide-react";
import Image from "next/image";

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

interface PendingPayment {
  id: string;             // collab_request id
  status: "pending" | "accepted";
  package_tier: string;
  package_price_paise: number;
  final_images: number;
  product_name: string;
  product_image_url: string;
  brief_one_liner: string;
  creator_name: string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:    { label: "Active",    color: "text-emerald-600", bg: "bg-emerald-500/10", icon: Zap },
  completed: { label: "Completed", color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", icon: CheckCircle2 },
  paused:    { label: "Paused",    color: "text-yellow-600",  bg: "bg-yellow-500/10",  icon: Clock },
};

const TIER_LABELS: Record<string, string> = { frame: "Frame", feature: "Feature", cover: "Cover" };
const TIER_COLORS: Record<string, { color: string; bg: string }> = {
  frame:   { color: "text-sky-500",                   bg: "bg-sky-500/10" },
  feature: { color: "text-[var(--color-primary)]",    bg: "bg-[var(--color-primary)]/10" },
  cover:   { color: "text-violet-500",                bg: "bg-violet-500/10" },
};

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export default function BrandCollabsPage() {
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/collabs", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { collabs: [], pending_payments: [] })
      .then((d) => {
        setCollabs(d.collabs ?? []);
        setPendingPayments(d.pending_payments ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const active    = collabs.filter((c) => c.status === "active");
  const completed = collabs.filter((c) => c.status !== "active");

  const accepted = pendingPayments.filter((p) => p.status === "accepted");
  const pending  = pendingPayments.filter((p) => p.status === "pending");

  const hasAnything = collabs.length > 0 || pendingPayments.length > 0;

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
            <Megaphone className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Collabs
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            Your Collabs
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Each collab is a self-contained workspace — Chat, Studio, Vault.
          </p>
        </div>
        <Link
          href="/brand/discover"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Start new collab
        </Link>
      </motion.div>

      {!hasAnything ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No collabs yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            Discover a creator and send a collab request to get started.
          </p>
          <Link
            href="/brand/discover"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)]"
          >
            Discover creators
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {/* ═══════════ GROUP 1 — REQUESTS ═══════════ */}
          {pendingPayments.length > 0 && (
            <div>
              <SectionHeader
                icon={Send}
                eyebrow="Step 1 · Sent to creators"
                title="Requests"
                count={pendingPayments.length}
                description="Collab requests you've sent. They become an active collab once the creator accepts and you complete payment."
              />

              <div className="space-y-5">
                {/* ── Awaiting payment (creator accepted) ── */}
                {accepted.length > 0 && (
                  <SubGroup label="Accepted — pay to activate" count={accepted.length} accent="primary">
                    <div className="space-y-3">
                      {accepted.map((p, i) => (
                        <PendingPaymentCard key={p.id} req={p} delay={i * 0.06} />
                      ))}
                    </div>
                  </SubGroup>
                )}

                {/* ── Awaiting creator response ── */}
                {pending.length > 0 && (
                  <SubGroup label="Waiting for creator response" count={pending.length} accent="muted">
                    <div className="space-y-3">
                      {pending.map((p, i) => (
                        <PendingPaymentCard key={p.id} req={p} delay={i * 0.05} />
                      ))}
                    </div>
                  </SubGroup>
                )}
              </div>
            </div>
          )}

          {/* ═══════════ GROUP 2 — COLLABS ═══════════ */}
          {collabs.length > 0 && (
            <div>
              <SectionHeader
                icon={Layers}
                eyebrow="Step 2 · Paid + active"
                title="Collabs"
                count={collabs.length}
                description="Live workspaces. Open Studio to generate, Vault to download approved images, Chat to talk to the creator."
              />

              <div className="space-y-5">
                {/* ── Active collab sessions ── */}
                {active.length > 0 && (
                  <SubGroup label="Active" count={active.length} accent="success">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {active.map((c, i) => <CollabCard key={c.id} collab={c} delay={i * 0.05} />)}
                    </div>
                  </SubGroup>
                )}

                {/* ── Completed / past sessions ── */}
                {completed.length > 0 && (
                  <SubGroup label="Past" count={completed.length} accent="muted">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {completed.map((c, i) => <CollabCard key={c.id} collab={c} delay={i * 0.04} />)}
                    </div>
                  </SubGroup>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Big section header ── */
function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  count,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  count: number;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            {eyebrow}
          </p>
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <h2 className="font-display text-[22px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            {title}
          </h2>
          <span className="font-mono text-[12px] font-700 text-[var(--color-muted-foreground)]">
            {count}
          </span>
        </div>
        <p className="mt-1.5 max-w-[640px] text-[12.5px] leading-snug text-[var(--color-muted-foreground)]">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ── Sub-group label inside a section ── */
function SubGroup({
  label,
  count,
  accent,
  children,
}: {
  label: string;
  count: number;
  accent: "primary" | "success" | "muted";
  children: React.ReactNode;
}) {
  const accentMap = {
    primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    muted:   "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]",
  };
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          {label}
        </p>
        <span className={`flex h-4 min-w-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[9px] font-700 ${accentMap[accent]}`}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── Pending payment / awaiting creator card ── */
function PendingPaymentCard({ req, delay }: { req: PendingPayment; delay: number }) {
  const tierColor = TIER_COLORS[req.package_tier] ?? TIER_COLORS.frame;
  const isAccepted = req.status === "accepted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-2xl border bg-[var(--color-card)] ${
        isAccepted
          ? "border-[var(--color-primary)]/40 shadow-[0_0_0_1px_rgba(201,169,110,0.1)]"
          : "border-[var(--color-border)]"
      }`}
    >
      {/* Gold top accent for accepted */}
      {isAccepted && <div className="h-0.5 w-full bg-[var(--color-primary)]" />}

      <div className="flex gap-0">
        {/* Product image */}
        <div className="relative w-[120px] shrink-0 sm:w-[140px]">
          {req.product_image_url ? (
            <Image
              src={req.product_image_url}
              alt={req.product_name}
              fill
              sizes="140px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--color-secondary)]">
              <FileImage className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-[16px] font-800 text-[var(--color-foreground)]">
                {req.product_name}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
                with {req.creator_name}
              </p>
            </div>
            {isAccepted ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-700 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Accepted
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-700 text-amber-600">
                <Clock className="h-3 w-3" /> Pending
              </span>
            )}
          </div>

          {/* Package info chips */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-700 ${tierColor.bg} ${tierColor.color}`}>
              <ImageIcon className="h-3 w-3" />
              {TIER_LABELS[req.package_tier] ?? req.package_tier}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-secondary)] px-2.5 py-0.5 text-[11px] font-600 text-[var(--color-muted-foreground)]">
              <IndianRupee className="h-3 w-3" />
              {fmt(req.package_price_paise)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-secondary)] px-2.5 py-0.5 text-[11px] font-600 text-[var(--color-muted-foreground)]">
              <FileImage className="h-3 w-3" />
              {req.final_images} images
            </span>
          </div>

          {/* Brief */}
          <p className="mt-2.5 line-clamp-1 text-[12px] text-[var(--color-muted-foreground)]">
            &ldquo;{req.brief_one_liner}&rdquo;
          </p>

          {/* Action */}
          <div className="mt-3">
            {isAccepted ? (
              <Link
                href={`/brand/collabs/${req.id}/payment`}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Pay {fmt(req.package_price_paise)} to activate <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="text-[12px] text-[var(--color-muted-foreground)]">
                Waiting for creator to accept or decline (72h window).
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Active / completed collab session card ── */
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
        href={`/brand/collabs/${collab.id}`}
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
          <div className="flex shrink-0 flex-col items-end gap-1.5">
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
            {collab.package_price_paise ? ` · ${fmt(collab.package_price_paise)}` : ""}
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
