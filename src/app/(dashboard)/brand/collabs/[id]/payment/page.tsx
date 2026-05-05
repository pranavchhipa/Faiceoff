"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Shield,
} from "lucide-react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Cashfree?: any;
  }
}

interface CollabRequest {
  id: string;
  status: string;
  package_tier: string;
  package_price_paise: number;
  final_images: number;
  product_name: string;
  brief_one_liner: string;
  collab_session_id: string | null;
}

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestId = params.id as string;
  const returnStatus = searchParams.get("status");

  const [req, setReq] = useState<CollabRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  // After Cashfree redirects back with status=done, confirm payment
  useEffect(() => {
    if (returnStatus === "done" && req?.status === "accepted" && !confirming) {
      setConfirming(true);
      fetch(`/api/collabs/${requestId}/confirm-payment`, { method: "POST" })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) {
            setPaid(true);
            router.replace(`/brand/collabs/${d.collab_session_id}`);
          }
        })
        .catch(console.error)
        .finally(() => setConfirming(false));
    }
  }, [returnStatus, req, requestId, confirming, router]);

  async function handlePay() {
    setError(null);
    setPaying(true);
    try {
      const res = await fetch(`/api/collabs/${requestId}/start-payment`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Payment failed");

      // Load Cashfree SDK and open checkout
      if (!window.Cashfree) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          script.onload = () => resolve();
          document.head.appendChild(script);
        });
      }
      const cashfree = window.Cashfree({ mode: process.env.NEXT_PUBLIC_CASHFREE_MODE ?? "production" });
      cashfree.checkout({ paymentSessionId: d.payment_session_id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  if (loading || confirming) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
        {confirming && <span className="ml-2 text-sm text-[var(--color-muted-foreground)]">Confirming payment…</span>}
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

  const tierLabel = req.package_tier.charAt(0).toUpperCase() + req.package_tier.slice(1);

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/brand/collabs"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to collabs
      </Link>

      <h1 className="font-display text-[28px] font-800 tracking-tight text-[var(--color-foreground)]">
        Complete payment
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
        Pay to unlock the collab and start generating.
      </p>

      {/* Summary */}
      <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Order summary
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-[14px]">
            <span className="text-[var(--color-muted-foreground)]">Package</span>
            <span className="font-700 text-[var(--color-foreground)]">{tierLabel}</span>
          </div>
          <div className="flex justify-between text-[14px]">
            <span className="text-[var(--color-muted-foreground)]">Product</span>
            <span className="font-700 text-[var(--color-foreground)]">{req.product_name}</span>
          </div>
          <div className="flex justify-between text-[14px]">
            <span className="text-[var(--color-muted-foreground)]">Final images</span>
            <span className="font-700 text-[var(--color-foreground)]">{req.final_images}</span>
          </div>
          <div className="flex justify-between text-[14px]">
            <span className="text-[var(--color-muted-foreground)]">Gen credits included</span>
            <span className="font-700 text-[var(--color-foreground)]">{req.final_images * 3}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-[var(--color-border)] pt-3 text-[16px]">
            <span className="font-700 text-[var(--color-foreground)]">Total</span>
            <span className="font-display text-[22px] font-800 text-[var(--color-foreground)]">
              {fmt(req.package_price_paise)}
            </span>
          </div>
        </div>
      </div>

      {/* Trust note */}
      <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
        <Shield className="h-4 w-4 shrink-0" />
        <p>
          Your payment is held by Faiceoff. Creator is paid only when you approve their images.
          Full refund if collab doesn&apos;t complete.
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-2.5 text-[13px] text-red-500">
          {error}
        </p>
      )}

      <button
        onClick={handlePay}
        disabled={paying || req.status !== "accepted"}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 text-[15px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition active:scale-[0.98] disabled:opacity-50"
      >
        {paying ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>Pay {fmt(req.package_price_paise)} <ArrowRight className="h-4 w-4" /></>
        )}
      </button>

      {req.status !== "accepted" && (
        <p className="mt-2 text-center text-[12px] text-[var(--color-muted-foreground)]">
          This request is {req.status} and cannot be paid.
        </p>
      )}
    </div>
  );
}
