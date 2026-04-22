"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Loader2,
  AlertCircle,
  ExternalLink,
  Zap,
  Wallet,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreatorInfo {
  id: string;
  display_name: string;
  base_price_paise: number;
  categories: string[];
}

export interface BrandBalance {
  credits_remaining: number;
  wallet_available_paise: number;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  creator: CreatorInfo;
  brandBalance: BrandBalance;
}

type LicenseScope = "digital" | "digital_print" | "digital_print_packaging";
type ScopeSetting = "digital" | "digital_print" | "digital_print_packaging";

interface GenerateResponse {
  generation_id: string;
  status: string;
}

interface ErrorResponse {
  error: string;
  reason?: string;
  required?: number;
  available?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOPE_ADDONS_PAISE: Record<LicenseScope, number> = {
  digital: 0,
  digital_print: 50000,        // ₹500
  digital_print_packaging: 100000, // ₹1000
};

const EXCLUSIVITY_RATE = 0.50;

const MOOD_OPTIONS = ["Editorial", "Playful", "Luxe", "Casual", "Minimal", "Bold"] as const;
const AESTHETIC_OPTIONS = ["Soft pastel", "Hard light", "Film grain", "Studio clean", "Magazine"] as const;

const SCOPE_OPTIONS: { value: ScopeSetting; label: string; sublabel: string; extra: string }[] = [
  { value: "digital", label: "Digital only", sublabel: "Social, web, display", extra: "" },
  { value: "digital_print", label: "Digital + Print", sublabel: "Magazines, banners", extra: "+₹500" },
  { value: "digital_print_packaging", label: "Digital + Print + Packaging", sublabel: "Product packaging", extra: "+₹1,000" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function computeTotal(
  basePaise: number,
  scope: ScopeSetting,
  exclusive: boolean,
): { base: number; scopeAddon: number; exclusivityPremium: number; total: number } {
  const scopeAddon = SCOPE_ADDONS_PAISE[scope];
  const effectiveRate = basePaise + scopeAddon;
  const exclusivityPremium = exclusive ? Math.round(effectiveRate * EXCLUSIVITY_RATE) : 0;
  const total = effectiveRate + exclusivityPremium;
  return { base: basePaise, scopeAddon, exclusivityPremium, total };
}

function scopeToArray(scope: ScopeSetting): Array<"digital" | "print" | "packaging"> {
  if (scope === "digital_print_packaging") return ["digital", "print", "packaging"];
  if (scope === "digital_print") return ["digital", "print"];
  return ["digital"];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PillRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly T[];
  selected: T | null;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className={`rounded-full px-3 py-1.5 text-xs font-600 transition-all ${
            selected === opt
              ? "bg-[var(--color-on-surface)] text-white"
              : "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ScopeCards({
  selected,
  onSelect,
}: {
  selected: ScopeSetting;
  onSelect: (v: ScopeSetting) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {SCOPE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
            selected === opt.value
              ? "border-[var(--color-on-surface)] bg-[var(--color-surface-container-low)]"
              : "border-[var(--color-outline-variant)]/20 hover:border-[var(--color-outline-variant)]/40"
          }`}
        >
          <div>
            <p className="text-sm font-600 text-[var(--color-on-surface)]">{opt.label}</p>
            <p className="text-xs text-[var(--color-outline-variant)]">{opt.sublabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {opt.extra && (
              <span className="text-xs font-600 text-[var(--color-outline-variant)]">{opt.extra}</span>
            )}
            {selected === opt.value && (
              <CheckCircle2 className="size-4 text-[var(--color-on-surface)]" />
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function PriceBar({
  base,
  scopeAddon,
  exclusivityPremium,
  total,
  hasEnoughCredits,
  hasEnoughWallet,
}: {
  base: number;
  scopeAddon: number;
  exclusivityPremium: number;
  total: number;
  hasEnoughCredits: boolean;
  hasEnoughWallet: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-[var(--color-surface-container-low)] px-4 py-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-[var(--color-outline-variant)]">
          <span>Base creator fee</span>
          <span>{formatINR(base)}</span>
        </div>
        {scopeAddon > 0 && (
          <div className="flex items-center justify-between text-xs text-[var(--color-outline-variant)]">
            <span>Scope add-on</span>
            <span>+{formatINR(scopeAddon)}</span>
          </div>
        )}
        {exclusivityPremium > 0 && (
          <div className="flex items-center justify-between text-xs text-[var(--color-outline-variant)]">
            <span>Exclusivity (+50%)</span>
            <span>+{formatINR(exclusivityPremium)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[var(--color-outline-variant)]/15 pt-2">
          <motion.span
            key={total}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="text-base font-700 text-[var(--color-on-surface)]"
          >
            {formatINR(total)}
          </motion.span>
          <span className="text-xs text-[var(--color-outline-variant)]">creator fee</span>
        </div>
      </div>

      {/* Balance warnings */}
      <div className="mt-2 flex flex-wrap gap-2">
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-600 ${
            hasEnoughCredits
              ? "bg-[var(--color-mint)] text-green-700"
              : "bg-[var(--color-blush)] text-red-600"
          }`}
        >
          <Zap className="size-3" />
          {hasEnoughCredits ? "1 credit available" : "No credits"}
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-600 ${
            hasEnoughWallet
              ? "bg-[var(--color-mint)] text-green-700"
              : "bg-[var(--color-blush)] text-red-600"
          }`}
        >
          <Wallet className="size-3" />
          {hasEnoughWallet ? "Wallet sufficient" : "Insufficient wallet"}
        </div>
      </div>

      <p className="mt-2 text-[10px] text-[var(--color-outline-variant)]">
        + 1 credit will be deducted on submit
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GenerationSheet({ open, onOpenChange, creator, brandBalance }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [product, setProduct] = useState("");
  const [scene, setScene] = useState("");
  const [mood, setMood] = useState<typeof MOOD_OPTIONS[number] | null>(null);
  const [aesthetic, setAesthetic] = useState<typeof AESTHETIC_OPTIONS[number] | null>(null);
  const [scope, setScope] = useState<ScopeSetting>("digital");
  const [exclusive, setExclusive] = useState(false);

  // UI state
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { base, scopeAddon, exclusivityPremium, total } = computeTotal(
    creator.base_price_paise,
    scope,
    exclusive,
  );

  const hasEnoughCredits = brandBalance.credits_remaining >= 1;
  const hasEnoughWallet = brandBalance.wallet_available_paise >= total;
  const canGenerate = hasEnoughCredits && hasEnoughWallet && product.trim().length > 0 && scene.trim().length > 0;

  function resetForm() {
    setProduct("");
    setScene("");
    setMood(null);
    setAesthetic(null);
    setScope("digital");
    setExclusive(false);
    setInlineError(null);
    setComplianceError(null);
  }

  async function handleGenerate() {
    if (!canGenerate || isSubmitting) return;

    setInlineError(null);
    setComplianceError(null);
    setIsSubmitting(true);

    try {
      const body = {
        creator_id: creator.id,
        structured_brief: {
          product: product.trim(),
          scene: scene.trim(),
          ...(mood ? { mood } : {}),
          ...(aesthetic ? { aesthetic } : {}),
          scope: scopeToArray(scope),
          exclusive,
        },
      };

      const res = await fetch("/api/generations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 202) {
        const data = (await res.json()) as GenerateResponse;
        toast.success("Generation started! Redirecting...");
        onOpenChange(false);
        resetForm();
        startTransition(() => {
          router.push(`/brand/sessions/${data.generation_id}`);
        });
        return;
      }

      const errData = (await res.json().catch(() => ({ error: "unknown" }))) as ErrorResponse;

      if (res.status === 402) {
        if (errData.error === "no_credits") {
          setInlineError("no_credits");
        } else if (errData.error === "low_wallet") {
          setInlineError("low_wallet");
        } else {
          setInlineError("billing");
        }
        return;
      }

      if (res.status === 422) {
        setComplianceError(errData.reason ?? "Content policy violation. Please revise your brief.");
        return;
      }

      if (res.status === 429) {
        toast.error("Rate limit reached — maximum 20 generations per hour.");
        return;
      }

      toast.error("Generation failed. Please try again.");
    } catch (err) {
      console.error("[generation-sheet] handleGenerate error:", err);
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(b) => { onOpenChange(b); if (!b) resetForm(); }}>
      <SheetContent
        side="right"
        className="flex flex-col w-full sm:max-w-lg bg-[var(--color-background)] p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-[var(--color-outline-variant)]/15 px-5 py-4">
          <SheetTitle className="text-lg font-800 text-[var(--color-on-surface)]">
            Generate with {creator.display_name}
          </SheetTitle>
          <SheetDescription className="text-xs text-[var(--color-outline-variant)]">
            1 credit + {formatINR(creator.base_price_paise)} creator fee per image
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Product */}
          <div>
            <p className="mb-2 text-xs font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
              Product
            </p>
            <Input
              placeholder="What product?"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="rounded-[var(--radius-input)] border-[var(--color-outline-variant)]/20 text-sm"
              maxLength={200}
            />
          </div>

          {/* Scene */}
          <div>
            <p className="mb-2 text-xs font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
              Scene
            </p>
            <Input
              placeholder="Where? mood?"
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              className="rounded-[var(--radius-input)] border-[var(--color-outline-variant)]/20 text-sm"
              maxLength={200}
            />
          </div>

          {/* Mood pills */}
          <div>
            <p className="mb-2 text-xs font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
              Mood
            </p>
            <PillRow
              options={MOOD_OPTIONS}
              selected={mood}
              onSelect={(v) => setMood(v === mood ? null : v)}
            />
          </div>

          {/* Aesthetic pills */}
          <div>
            <p className="mb-2 text-xs font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
              Aesthetic
            </p>
            <PillRow
              options={AESTHETIC_OPTIONS}
              selected={aesthetic}
              onSelect={(v) => setAesthetic(v === aesthetic ? null : v)}
            />
          </div>

          {/* Scope */}
          <div>
            <p className="mb-2 text-xs font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
              License scope
            </p>
            <ScopeCards selected={scope} onSelect={setScope} />
          </div>

          {/* Exclusivity */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-[var(--color-outline-variant)]/20 p-4 hover:border-[var(--color-outline-variant)]/40 transition-colors">
              <input
                type="checkbox"
                checked={exclusive}
                onChange={(e) => setExclusive(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-outline-variant)]/30 accent-[var(--color-on-surface)]"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-[var(--color-on-surface)]">
                  Exclusive license
                </p>
                <p className="text-xs text-[var(--color-outline-variant)]">
                  +50% creator fee — prevents this creator from working with other brands in this category
                </p>
              </div>
              <span className="shrink-0 text-xs font-600 text-[var(--color-outline-variant)]">
                +{formatINR(Math.round((creator.base_price_paise + SCOPE_ADDONS_PAISE[scope]) * EXCLUSIVITY_RATE))}
              </span>
            </label>
          </div>

          {/* Compliance error */}
          {complianceError && (
            <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-600 text-red-700 mb-0.5">Content policy violation</p>
                <p className="text-xs text-red-600">{complianceError}</p>
              </div>
            </div>
          )}

          {/* Insufficient credits inline error */}
          {inlineError === "no_credits" && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-blush)] border border-red-100 px-4 py-3">
              <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-[var(--color-on-surface)] mb-0.5">No credits remaining</p>
                <p className="text-xs text-[var(--color-outline-variant)]">Buy a credit pack to continue.</p>
              </div>
              <Link href="/brand/credits" onClick={() => onOpenChange(false)}>
                <Button size="xs" className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-on-surface)] font-600 text-white">
                  Top up
                  <ChevronRight className="size-3" />
                </Button>
              </Link>
            </div>
          )}

          {/* Insufficient wallet inline error */}
          {inlineError === "low_wallet" && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-blush)] border border-red-100 px-4 py-3">
              <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-[var(--color-on-surface)] mb-0.5">Wallet balance too low</p>
                <p className="text-xs text-[var(--color-outline-variant)]">
                  Need {formatINR(total)} to cover the creator fee.
                </p>
              </div>
              <Link href="/brand/wallet" onClick={() => onOpenChange(false)}>
                <Button size="xs" className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-on-surface)] font-600 text-white">
                  Add funds
                  <ExternalLink className="size-3" />
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Sticky footer: price bar + generate button */}
        <div className="shrink-0 border-t border-[var(--color-outline-variant)]/15 px-5 py-4 space-y-3 bg-[var(--color-background)]">
          <PriceBar
            base={base}
            scopeAddon={scopeAddon}
            exclusivityPremium={exclusivityPremium}
            total={total}
            hasEnoughCredits={hasEnoughCredits}
            hasEnoughWallet={hasEnoughWallet}
          />

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isSubmitting || isPending}
            className="w-full rounded-[var(--radius-button)] bg-[var(--color-primary)] font-600 text-white hover:bg-[var(--color-primary-dim)] h-11 disabled:opacity-50"
          >
            {isSubmitting || isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Generate
              </>
            )}
          </Button>

          {!product.trim() && (
            <p className="text-center text-xs text-[var(--color-outline-variant)]">
              Describe your product and scene to enable generation
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
