"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Shield,
  Image as ImageIcon,
  Zap,
  Globe,
  Sparkles,
  FileCheck2,
  MessageSquare,
  Lock,
  Clock,
  Receipt,
  AtSign,
} from "lucide-react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

interface CollabRequest {
  id: string;
  status: string;
  package_tier: "frame" | "feature" | "cover" | string;
  package_price_paise: number;
  final_images: number;
  product_name: string;
  product_image_url: string | null;
  brief_one_liner: string;
  collab_session_id: string | null;
  creator_name: string | null;
  creator_avatar_url: string | null;
  creator_handle: string | null;
}

const TIER_META = {
  frame:   { label: "Frame",   icon: ImageIcon, badgeBg: "bg-sky-500",                badgeText: "text-white",                              bar: "bg-sky-500" },
  feature: { label: "Feature", icon: Zap,       badgeBg: "bg-[var(--color-primary)]", badgeText: "text-[var(--color-primary-foreground)]",  bar: "bg-[var(--color-primary)]" },
  cover:   { label: "Cover",   icon: Globe,     badgeBg: "bg-violet-500",             badgeText: "text-white",                              bar: "bg-violet-500" },
} as const;

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default function CollabPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;

  const [req, setReq] = useState<CollabRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const loadRequest = useCallback(async () => {
    try {
      const res = await fetch(`/api/collab-requests/${requestId}`, { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setReq(d.request);
        if (d.request?.status === "paid") setPaid(true);
      }
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { loadRequest(); }, [loadRequest]);

  async function handlePay() {
    setError(null);
    setPaying(true);
    try {
      const res = await fetch(`/api/collabs/${requestId}/start-payment`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Payment failed");

      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load payment SDK"));
          document.head.appendChild(script);
        });
      }

      if (!window.Razorpay) throw new Error("Payment SDK not available");

      const rzp = new window.Razorpay({
        key: d.key_id,
        amount: d.amount_paise,
        currency: "INR",
        order_id: d.order_id,
        name: "Faiceoff",
        description: req?.product_name ?? "Collab payment",
        theme: { color: "#C9A96E" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const confirmRes = await fetch(`/api/collabs/${requestId}/confirm-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const confirmData = await confirmRes.json();
            if (confirmData.ok) {
              setPaid(true);
              router.replace(`/brand/collabs/${confirmData.collab_session_id}`);
            } else {
              // Surface server detail + Razorpay payment ID so support can
              // reconcile manually if the webhook also fails.
              const detail = confirmData.detail ? ` (${confirmData.detail})` : "";
              const hint = confirmData.hint ?? "Your payment is safe — refresh in a minute or contact support.";
              setError(
                `${confirmData.error ?? "Session creation failed"}${detail}. ${hint} Razorpay payment ID: ${response.razorpay_payment_id}`
              );
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "network error";
            setError(`Payment was received by Razorpay (${response.razorpay_payment_id}) but we couldn't confirm it (${msg}). Please refresh in a minute — the webhook will reconcile automatically.`);
          }
        },
      });

      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (paid) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-500" />
        <h2 className="font-display text-[26px] font-800 tracking-tight text-[var(--color-foreground)]">
          Payment successful!
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Your collab is now active. Head to Studio to start generating.
        </p>
        <button
          onClick={() => router.push("/brand/collabs")}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)]"
        >
          Go to Collabs <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (!req) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-[var(--color-muted-foreground)]">Request not found.</p>
        <Link href="/brand/collabs" className="mt-4 block text-sm text-[var(--color-primary)]">
          Back to collabs
        </Link>
      </div>
    );
  }

  const tierKey = (req.package_tier as keyof typeof TIER_META) in TIER_META
    ? (req.package_tier as keyof typeof TIER_META)
    : "frame";
  const tier = TIER_META[tierKey];
  const TierIcon = tier.icon;

  // Pricing breakup
  const subtotal   = req.package_price_paise;
  const genCredits = req.final_images * 3;

  return (
    <div className="mx-auto max-w-[920px] px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/brand/requests"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to requests
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <Lock className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
          Step 3 of 4 · Activate collab
        </p>
        <h1 className="mt-1 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] sm:text-[40px]">
          Complete payment
        </h1>
        <p className="mt-2 max-w-lg text-[14px] text-[var(--color-muted-foreground)]">
          Funds are held by Faiceoff in escrow. The creator is paid only after you approve their final images.
        </p>
      </motion.div>

      {/* Two-column grid: left = collab card + breakup; right = total + pay */}
      <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-5">

          {/* Hero collab card */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
          >
            <div className={`h-[3px] w-full ${tier.bar}`} />
            <div className="flex flex-col sm:flex-row">
              {/* Product image */}
              <div className="relative aspect-[4/3] w-full shrink-0 sm:aspect-square sm:w-[220px]">
                {req.product_image_url ? (
                  <Image
                    src={req.product_image_url}
                    alt={req.product_name}
                    fill
                    sizes="220px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--color-secondary)]">
                    <ImageIcon className="h-10 w-10 text-[var(--color-muted-foreground)]" />
                  </div>
                )}
                <span className={`absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] ${tier.badgeBg} ${tier.badgeText}`}>
                  <TierIcon className="h-3 w-3" />
                  {tier.label} package
                </span>
              </div>

              {/* Details */}
              <div className="flex flex-1 flex-col justify-between gap-4 p-5 sm:p-6">
                <div>
                  <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Product
                  </p>
                  <h3 className="mt-1 font-display text-[20px] font-800 leading-tight text-[var(--color-foreground)]">
                    {req.product_name}
                  </h3>

                  <div className="mt-3 flex items-center gap-2.5">
                    {req.creator_avatar_url ? (
                      <Image
                        src={req.creator_avatar_url}
                        alt={req.creator_name ?? "Creator"}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover ring-2 ring-[var(--color-border)]"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[12px] font-700 text-[var(--color-foreground)] ring-2 ring-[var(--color-border)]">
                        {(req.creator_name ?? "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-700 text-[var(--color-foreground)]">
                        with {req.creator_name ?? "Creator"}
                      </p>
                      {req.creator_handle && (
                        <p className="flex items-center gap-0.5 truncate text-[11px] text-[var(--color-muted-foreground)]">
                          <AtSign className="h-2.5 w-2.5" />
                          {req.creator_handle.replace(/^@/, "")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Brief
                  </p>
                  <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-[var(--color-foreground)]">
                    &ldquo;{req.brief_one_liner}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* What's included */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6"
          >
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              <Sparkles className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
              What you get
            </p>
            <h3 className="mt-1 font-display text-[18px] font-800 text-[var(--color-foreground)]">
              Included with the {tier.label} package
            </h3>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Perk
                icon={ImageIcon}
                label={`${req.final_images} final images`}
                sub="Brand-approved, commercial-ready, full resolution"
              />
              <Perk
                icon={Zap}
                label={`${genCredits} generation credits`}
                sub={`3× per final image — iterate freely until you pick the keeper`}
              />
              <Perk
                icon={FileCheck2}
                label="Verifiable license PDF"
                sub="Issued on creator approval, with cert URL + EXIF watermark"
              />
              <Perk
                icon={MessageSquare}
                label="Direct chat with creator"
                sub="Realtime — unlocks immediately on payment"
              />
              <Perk
                icon={Lock}
                label="Compliance gate"
                sub="Creator's blocked categories enforced automatically"
              />
              <Perk
                icon={Receipt}
                label="GST invoice"
                sub="Compliant tax invoice generated for your accounting"
              />
            </div>
          </motion.div>

          {/* What happens next — timeline */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6"
          >
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              <Clock className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
              After you pay
            </p>
            <h3 className="mt-1 font-display text-[18px] font-800 text-[var(--color-foreground)]">
              Here&apos;s what happens next
            </h3>

            <ol className="mt-4 space-y-3">
              <Step
                num="1"
                title="Studio + Chat unlock instantly"
                sub="You can generate images right away. Funds enter Faiceoff escrow."
              />
              <Step
                num="2"
                title="Iterate per image"
                sub="Use up to 3 generations per slot. Pick your best one and send it for creator approval."
              />
              <Step
                num="3"
                title="Creator approves (within 48h)"
                sub="On approval, license PDF is issued and the creator's share enters their escrow holding."
              />
              <Step
                num="4"
                title="Collab completes"
                sub="When all final images are approved, escrow releases the creator&apos;s payout. You get a tax invoice."
                last
              />
            </ol>
          </motion.div>
        </div>

        {/* ── RIGHT COLUMN — Sticky pay panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="lg:sticky lg:top-6 lg:self-start"
        >
          <div className="overflow-hidden rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-card)] shadow-[0_8px_32px_-12px_rgba(201,169,110,0.2)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-5 py-3">
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                <Receipt className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
                Order summary
              </p>
            </div>

            <div className="space-y-2.5 px-5 py-4">
              <Row label={`${tier.label} package`} value={fmt(subtotal)} />
              <Row label="Final images" value={`${req.final_images} included`} muted />
              <Row label="Generation credits" value={`${genCredits} included`} muted />
              <Row label="License PDF" value="Included" muted />
              <Row label="Direct chat" value="Included" muted />
              <Row label="GST & platform fee" value="Included" muted />
            </div>

            <div className="border-t border-[var(--color-border)] px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-700 text-[var(--color-foreground)]">Total</span>
                <span className="font-display text-[28px] font-800 leading-none text-[var(--color-foreground)]">
                  {fmt(subtotal)}
                </span>
              </div>
              <p className="mt-1 text-right text-[11px] text-[var(--color-muted-foreground)]">
                One-time · all-inclusive
              </p>
            </div>

            <div className="px-5 pb-5">
              {error && (
                <p className="mb-3 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-[12px] text-red-500">
                  {error}
                </p>
              )}

              <button
                onClick={handlePay}
                disabled={paying || req.status !== "accepted"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3.5 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {paying ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>Pay {fmt(subtotal)} securely <ArrowRight className="h-4 w-4" /></>
                )}
              </button>

              {req.status !== "accepted" && (
                <p className="mt-2 text-center text-[11px] text-[var(--color-muted-foreground)]">
                  This request is {req.status} and cannot be paid.
                </p>
              )}

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <p className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
                  <span className="font-700">100% escrow protected.</span> Full refund if the creator doesn&apos;t deliver.
                </p>
              </div>

              <p className="mt-3 text-center text-[10px] text-[var(--color-muted-foreground)]">
                Powered by <span className="font-700 text-[var(--color-foreground)]">Razorpay</span> · UPI, Cards, Netbanking
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Perk({
  icon: Icon,
  label,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-700 text-[var(--color-foreground)]">{label}</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-muted-foreground)]">{sub}</p>
      </div>
    </div>
  );
}

function Step({
  num,
  title,
  sub,
  last,
}: {
  num: string;
  title: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-3">
      {!last && (
        <span className="absolute left-[14px] top-7 h-[calc(100%-12px)] w-px bg-[var(--color-border)]" />
      )}
      <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-card)] font-mono text-[11px] font-700 text-[var(--color-primary)]">
        {num}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[13px] font-700 text-[var(--color-foreground)]">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">{sub}</p>
      </div>
    </li>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className={muted ? "text-[var(--color-muted-foreground)]" : "text-[var(--color-foreground)]"}>
        {label}
      </span>
      <span className={muted ? "text-[12px] text-[var(--color-muted-foreground)]" : "font-700 text-[var(--color-foreground)]"}>
        {value}
      </span>
    </div>
  );
}
