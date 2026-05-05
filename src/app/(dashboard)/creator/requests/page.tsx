"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Loader2,
  Image as ImageIcon,
  Zap,
  Globe,
} from "lucide-react";
import Link from "next/link";

interface CollabRequest {
  id: string;
  status: "pending" | "accepted" | "declined" | "paid" | "expired" | "cancelled";
  package_tier: "frame" | "feature" | "cover";
  package_price_paise: number;
  final_images: number;
  product_name: string;
  brief_one_liner: string;
  expires_at: string;
  created_at: string;
  brand_display_name?: string;
}

const TIER_META = {
  frame:   { label: "Frame",   icon: ImageIcon, color: "text-sky-500",                    bg: "bg-sky-500/10" },
  feature: { label: "Feature", icon: Zap,       color: "text-[var(--color-primary)]",     bg: "bg-[var(--color-primary)]/10" },
  cover:   { label: "Cover",   icon: Globe,     color: "text-violet-500",                bg: "bg-violet-500/10" },
} as const;

const STATUS_META = {
  pending:   { label: "Pending",   color: "text-yellow-600",   bg: "bg-yellow-500/10",  icon: Clock },
  accepted:  { label: "Accepted",  color: "text-emerald-600",  bg: "bg-emerald-500/10", icon: CheckCircle2 },
  declined:  { label: "Declined",  color: "text-red-500",      bg: "bg-red-500/10",     icon: XCircle },
  paid:      { label: "Active",    color: "text-emerald-600",  bg: "bg-emerald-500/10", icon: CheckCircle2 },
  expired:   { label: "Expired",   color: "text-[var(--color-muted-foreground)]", bg: "bg-[var(--color-secondary)]", icon: Clock },
  cancelled: { label: "Cancelled", color: "text-[var(--color-muted-foreground)]", bg: "bg-[var(--color-secondary)]", icon: XCircle },
} as const;

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function timeLeft(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export default function CreatorRequestsPage() {
  const [requests, setRequests] = useState<CollabRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/creator/requests", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          setRequests(d.requests ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAccept(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/collab-requests/${id}/accept`, { method: "POST" });
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "accepted" } : r));
      }
    } finally {
      setActing(null);
    }
  }

  async function handleDecline(id: string) {
    const reason = window.prompt("Reason for declining (optional):") ?? "";
    setActing(id);
    try {
      const res = await fetch(`/api/collab-requests/${id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "declined" } : r));
      }
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const past = requests.filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 lg:px-8 lg:py-8">
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6"
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <Inbox className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
          Collab Requests
        </p>
        <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
          Requests
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Accept to unlock the collab and chat. Brand pays only after you accept.
        </p>
      </motion.div>

      {requests.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No requests yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            Make sure you have an active package and are{" "}
            <Link href="/creator/packages" className="text-[var(--color-primary)] underline">
              set as Live
            </Link>.
          </p>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <section className="mb-6">
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Pending — {pending.length}
          </p>
          <div className="space-y-3">
            {pending.map((req, i) => (
              <RequestCard
                key={req.id}
                req={req}
                delay={i * 0.06}
                onAccept={handleAccept}
                onDecline={handleDecline}
                acting={acting === req.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <section>
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Past requests
          </p>
          <div className="space-y-3">
            {past.map((req, i) => (
              <RequestCard
                key={req.id}
                req={req}
                delay={i * 0.04}
                onAccept={handleAccept}
                onDecline={handleDecline}
                acting={acting === req.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RequestCard({
  req,
  delay,
  onAccept,
  onDecline,
  acting,
}: {
  req: CollabRequest;
  delay: number;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  acting: boolean;
}) {
  const tier = TIER_META[req.package_tier];
  const status = STATUS_META[req.status];
  const TierIcon = tier.icon;
  const StatusIcon = status.icon;
  const isPending = req.status === "pending";

  return (
    <motion.div
      variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tier.bg} ${tier.color}`}>
            <TierIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-[15px] font-800 text-[var(--color-foreground)]">
              {req.product_name}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
              {req.brand_display_name ?? "A brand"} · {tier.label} · {fmt(req.package_price_paise)} · {req.final_images} images
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)] italic">
              &ldquo;{req.brief_one_liner}&rdquo;
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-700 ${status.bg} ${status.color}`}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </span>
          {isPending && (
            <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {timeLeft(req.expires_at)}
            </span>
          )}
        </div>
      </div>

      {isPending && (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
          <button
            onClick={() => onDecline(req.id)}
            disabled={acting}
            className="flex-1 rounded-xl border border-[var(--color-border)] py-2 text-[13px] font-700 text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-secondary)] disabled:opacity-50"
          >
            Decline
          </button>
          <button
            onClick={() => onAccept(req.id)}
            disabled={acting}
            className="flex-1 rounded-xl bg-[var(--color-primary)] py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {acting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Accept"}
          </button>
        </div>
      )}

      {req.status === "accepted" && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-[12px] text-[var(--color-muted-foreground)]">
            Waiting for brand payment. Chat and Studio unlock once paid.
          </p>
        </div>
      )}
    </motion.div>
  );
}
