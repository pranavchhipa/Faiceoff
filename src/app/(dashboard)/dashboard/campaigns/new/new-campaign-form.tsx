"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Sparkles,
  FileText,
  Palette,
  Eye,
  ImagePlus,
  X,
} from "lucide-react";
import Link from "next/link";

/* ================================================================
   Types
   ================================================================ */

interface CreatorOption {
  id: string;
  display_name: string;
  categories: { category: string; price_per_generation_paise: number }[];
}

interface PromptBrief {
  setting: string;
  settingCustom: string;
  pose: string;
  poseCustom: string;
  expression: string;
  expressionCustom: string;
  outfit: string;
  props: string;
  style: string;
  notes: string;
  productName: string;
  productDescription: string;
  productImageUrl: string;
}

/* ================================================================
   Constants
   ================================================================ */

const SETTINGS = ["Studio", "Outdoor", "Office", "Cafe", "Home", "Custom"];
const POSES = [
  "Standing",
  "Sitting",
  "Walking",
  "Close-up portrait",
  "Action shot",
  "Custom",
];
const EXPRESSIONS = [
  "Neutral",
  "Smiling",
  "Serious",
  "Laughing",
  "Confident",
  "Custom",
];
const STYLES = [
  "Photorealistic",
  "Editorial",
  "Lifestyle",
  "Commercial",
  "Cinematic",
];

const STEP_LABELS = [
  { label: "Details", icon: FileText },
  { label: "Prompt", icon: Palette },
  { label: "Review", icon: Eye },
];

/* ================================================================
   Helpers
   ================================================================ */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** Slide-in / slide-out variants keyed by direction */
const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -80 : 80,
    opacity: 0,
  }),
};

/* ================================================================
   Select dropdown component (custom, no radix dependency)
   ================================================================ */

function SelectField({
  label,
  value,
  options,
  onChange,
  customValue,
  onCustomChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  customValue?: string;
  onCustomChange?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-600 text-[var(--color-ink)]">
        {label}
      </Label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-neutral-400)]" />
      </div>
      {value === "Custom" && onCustomChange && (
        <Input
          placeholder={`Custom ${label.toLowerCase()}...`}
          value={customValue ?? ""}
          onChange={(e) => onCustomChange(e.target.value)}
          className="rounded-[var(--radius-input)]"
        />
      )}
    </div>
  );
}

/* ================================================================
   Main Form
   ================================================================ */

export function NewCampaignForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  /* ── State ── */
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Creator selection
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>(
    searchParams.get("creator") ?? ""
  );
  const [creatorsLoading, setCreatorsLoading] = useState(true);

  // Step 1: Campaign details
  const [campaignName, setCampaignName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [maxGenerations, setMaxGenerations] = useState(5);

  // Step 2: Prompt builder
  const [brief, setBrief] = useState<PromptBrief>({
    setting: "",
    settingCustom: "",
    pose: "",
    poseCustom: "",
    expression: "",
    expressionCustom: "",
    outfit: "",
    props: "",
    style: "",
    notes: "",
    productName: "",
    productDescription: "",
    productImageUrl: "",
  });

  // Product image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [productUploading, setProductUploading] = useState(false);
  const [productUploadError, setProductUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /* ── Upload product image ── */
  async function uploadProductImage(file: File) {
    // Validate on client
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProductUploadError("Only JPEG, PNG, or WebP images allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProductUploadError("Image must be under 5 MB");
      return;
    }

    setProductUploading(true);
    setProductUploadError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/campaigns/upload-product-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      setBrief((b) => ({ ...b, productImageUrl: data.url }));
    } catch (err) {
      setProductUploadError(
        err instanceof Error ? err.message : "Upload failed"
      );
    } finally {
      setProductUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadProductImage(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadProductImage(file);
  }

  function removeProductImage() {
    setBrief((b) => ({ ...b, productImageUrl: "" }));
    setProductUploadError(null);
  }

  /* ── Fetch available creators ── */
  useEffect(() => {
    if (!user) return;

    async function load() {
      setCreatorsLoading(true);

      // Get active creators via API (bypasses RLS on users table)
      try {
        const res = await fetch("/api/creators");
        if (res.ok) {
          const data = await res.json();
          const mapped: CreatorOption[] = (data.creators ?? []).map(
            (c: { id: string; display_name: string; categories: { category: string; price_per_generation_paise: number }[] }) => ({
              id: c.id,
              display_name: c.display_name ?? "Unnamed Creator",
              categories: c.categories ?? [],
            })
          );
          setCreators(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch creators:", err);
      }

      setCreatorsLoading(false);
    }

    load();
  }, [user]);

  /* ── Derived values ── */
  const selectedCreator = creators.find((c) => c.id === selectedCreatorId);
  const creatorCategories = selectedCreator?.categories ?? [];
  const selectedCat = creatorCategories.find((c) => c.category === selectedCategory);
  const pricePerGen = selectedCat?.price_per_generation_paise ?? 0;
  const totalBudget = pricePerGen * maxGenerations;

  const creatorDisplayName = selectedCreator?.display_name ?? "[creator]";

  const assembledPrompt = useMemo(() => {
    const setting =
      brief.setting === "Custom" ? brief.settingCustom : brief.setting;
    const pose = brief.pose === "Custom" ? brief.poseCustom : brief.pose;
    const expression =
      brief.expression === "Custom"
        ? brief.expressionCustom
        : brief.expression;
    const style = brief.style || "Photorealistic";

    const parts: string[] = [];

    parts.push(`A ${style.toLowerCase()}`);
    if (setting) parts.push(`${setting.toLowerCase()}`);
    parts.push(`photo of ${creatorDisplayName}`);
    if (pose) parts.push(pose.toLowerCase());
    if (expression)
      parts.push(`with a ${expression.toLowerCase()} expression`);
    if (brief.outfit) parts.push(`, ${brief.outfit}`);
    if (brief.productName)
      parts.push(`, showcasing ${brief.productName}`);
    if (brief.productDescription)
      parts.push(`(${brief.productDescription})`);
    if (brief.props) parts.push(`, ${brief.props}`);
    if (brief.notes) parts.push(`. ${brief.notes}`);

    return parts.join(" ").replace(/\s{2,}/g, " ").replace(/ ,/g, ",");
  }, [brief, creatorDisplayName]);

  /* ── Validation ── */
  const step1Valid =
    campaignName.trim().length > 0 &&
    selectedCreatorId.length > 0 &&
    selectedCategory.length > 0 &&
    maxGenerations >= 1 &&
    maxGenerations <= 100;

  const step2Valid = brief.style.length > 0;

  /* ── Navigation ── */
  const goNext = useCallback(() => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, 2));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  /* ── Submit ── */
  async function handleSubmit() {
    if (!selectedCreatorId) {
      setError("Please select a creator");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Insert campaign via API route (bypasses RLS)
      const campRes = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: selectedCreatorId,
          name: campaignName.trim(),
          description: description.trim() || null,
          budget_paise: totalBudget,
          max_generations: maxGenerations,
        }),
      });

      if (!campRes.ok) {
        const campData = await campRes.json();
        throw new Error(campData.error ?? "Failed to create campaign");
      }

      const { campaign_id } = await campRes.json();

      // 2. Create generation via API route (triggers Inngest pipeline)
      const structuredBrief = {
        setting:
          brief.setting === "Custom" ? brief.settingCustom : brief.setting,
        pose: brief.pose === "Custom" ? brief.poseCustom : brief.pose,
        expression:
          brief.expression === "Custom"
            ? brief.expressionCustom
            : brief.expression,
        outfit: brief.outfit,
        props: brief.props,
        style: brief.style,
        notes: brief.notes,
        subject: creatorDisplayName,
        category: selectedCategory,
        product_name: brief.productName || null,
        product_description: brief.productDescription || null,
        product_image_url: brief.productImageUrl || null,
      };

      const genRes = await fetch("/api/generations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id,
          structured_brief: structuredBrief,
        }),
      });

      if (!genRes.ok) {
        const genData = await genRes.json();
        throw new Error(genData.error ?? "Failed to create generation");
      }

      // 3. Redirect to campaign detail
      router.push(`/dashboard/campaigns/${campaign_id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setSubmitting(false);
    }
  }

  /* ── Loading ── */
  if (authLoading || creatorsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-gold)]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-4xl"
    >
      {/* Back link */}
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-sm font-500 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] mb-6 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Campaigns
      </Link>

      {/* Title */}
      <h1 className="text-3xl font-800 tracking-tight text-[var(--color-ink)] mb-2">
        New Campaign
      </h1>
      <p className="text-[var(--color-neutral-500)] mb-8">
        Create an AI content campaign with a creator.
      </p>

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-2 mb-8">
        {STEP_LABELS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={s.label} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 transition-colors ${
                    isDone
                      ? "bg-[var(--color-gold)]"
                      : "bg-[var(--color-neutral-200)]"
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (i < step) {
                    setDirection(-1);
                    setStep(i);
                  }
                }}
                disabled={i > step}
                className={`inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-600 transition-colors ${
                  isActive
                    ? "bg-[var(--color-gold)] text-white"
                    : isDone
                      ? "bg-[var(--color-gold)]/15 text-[var(--color-gold-hover)] cursor-pointer"
                      : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-400)]"
                }`}
              >
                {isDone ? (
                  <Check className="size-3.5" />
                ) : (
                  <Icon className="size-3.5" />
                )}
                {s.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Step content ── */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ════════════════════════════════════════════
              STEP 1 — Campaign Details
              ════════════════════════════════════════════ */}
          {step === 0 && (
            <motion.div
              key="step-0"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="p-6"
            >
              <h2 className="text-lg font-700 text-[var(--color-ink)] mb-1">
                Campaign Details
              </h2>
              <p className="text-sm text-[var(--color-neutral-500)] mb-6">
                Set up the basics for your campaign.
              </p>

              <div className="flex flex-col gap-5">
                {/* Campaign Name */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="campaign-name"
                    className="text-sm font-600 text-[var(--color-ink)]"
                  >
                    Campaign Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="campaign-name"
                    placeholder="e.g. Summer Collection Launch"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="rounded-[var(--radius-input)]"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="campaign-desc"
                    className="text-sm font-600 text-[var(--color-ink)]"
                  >
                    Description
                  </Label>
                  <textarea
                    id="campaign-desc"
                    placeholder="Brief description of what this campaign is about..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>

                {/* Creator Selection */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-600 text-[var(--color-ink)]">
                    Creator <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <select
                      value={selectedCreatorId}
                      onChange={(e) => {
                        setSelectedCreatorId(e.target.value);
                        setSelectedCategory(""); // Reset category on creator change
                      }}
                      className="h-9 w-full appearance-none rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="">Select a creator...</option>
                      {creators.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name} — {c.categories.length} categor{c.categories.length === 1 ? "y" : "ies"}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-neutral-400)]" />
                  </div>
                </div>

                {/* Category Selection (shown after creator is picked) */}
                {selectedCreator && creatorCategories.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-600 text-[var(--color-ink)]">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="h-9 w-full appearance-none rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <option value="">Select a category...</option>
                        {creatorCategories.map((cat) => (
                          <option key={cat.category} value={cat.category}>
                            {cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} — {formatINR(cat.price_per_generation_paise)}/gen
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-neutral-400)]" />
                    </div>
                    {selectedCat && (
                      <p className="text-xs text-[var(--color-neutral-400)]">
                        Price: {formatINR(selectedCat.price_per_generation_paise)} per generation
                      </p>
                    )}
                  </div>
                )}

                {/* Max Generations */}
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="max-gens"
                    className="text-sm font-600 text-[var(--color-ink)]"
                  >
                    Max Generations <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="max-gens"
                    type="number"
                    min={1}
                    max={100}
                    value={maxGenerations}
                    onChange={(e) =>
                      setMaxGenerations(
                        Math.max(1, Math.min(100, Number(e.target.value) || 1))
                      )
                    }
                    className="rounded-[var(--radius-input)] max-w-32"
                  />
                  <p className="text-xs text-[var(--color-neutral-400)]">
                    Between 1 and 100 generations
                  </p>
                </div>

                {/* Budget preview */}
                {pricePerGen > 0 && (
                  <div className="rounded-[var(--radius-input)] bg-[var(--color-ocean)]/20 border border-[var(--color-ocean)] px-4 py-3">
                    <p className="text-sm font-600 text-[var(--color-ink)]">
                      Estimated Budget:{" "}
                      <span className="text-[var(--color-gold-hover)]">
                        {formatINR(totalBudget)}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--color-neutral-500)] mt-0.5">
                      {formatINR(pricePerGen)} x {maxGenerations} generations
                    </p>
                  </div>
                )}
              </div>

              {/* Step 1 footer */}
              <div className="mt-8 flex justify-end">
                <Button
                  onClick={goNext}
                  disabled={!step1Valid}
                  className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)] disabled:opacity-50"
                >
                  Next: Build Prompt
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════
              STEP 2 — Guided Prompt Builder
              ════════════════════════════════════════════ */}
          {step === 1 && (
            <motion.div
              key="step-1"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="p-6"
            >
              <h2 className="text-lg font-700 text-[var(--color-ink)] mb-1">
                Guided Prompt Builder
              </h2>
              <p className="text-sm text-[var(--color-neutral-500)] mb-6">
                Describe the content you want generated. We will assemble a
                prompt for the AI model.
              </p>

              <div className="grid gap-5 sm:grid-cols-2">
                {/* Setting */}
                <SelectField
                  label="Setting"
                  value={brief.setting}
                  options={SETTINGS}
                  onChange={(v) => setBrief((b) => ({ ...b, setting: v }))}
                  customValue={brief.settingCustom}
                  onCustomChange={(v) =>
                    setBrief((b) => ({ ...b, settingCustom: v }))
                  }
                />

                {/* Pose / Action */}
                <SelectField
                  label="Pose / Action"
                  value={brief.pose}
                  options={POSES}
                  onChange={(v) => setBrief((b) => ({ ...b, pose: v }))}
                  customValue={brief.poseCustom}
                  onCustomChange={(v) =>
                    setBrief((b) => ({ ...b, poseCustom: v }))
                  }
                />

                {/* Expression */}
                <SelectField
                  label="Expression"
                  value={brief.expression}
                  options={EXPRESSIONS}
                  onChange={(v) => setBrief((b) => ({ ...b, expression: v }))}
                  customValue={brief.expressionCustom}
                  onCustomChange={(v) =>
                    setBrief((b) => ({ ...b, expressionCustom: v }))
                  }
                />

                {/* Style */}
                <SelectField
                  label="Style"
                  value={brief.style}
                  options={STYLES}
                  onChange={(v) => setBrief((b) => ({ ...b, style: v }))}
                />

                {/* Outfit */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-600 text-[var(--color-ink)]">
                    Outfit
                  </Label>
                  <Input
                    placeholder="e.g. wearing a navy blazer and white shirt"
                    value={brief.outfit}
                    onChange={(e) =>
                      setBrief((b) => ({ ...b, outfit: e.target.value }))
                    }
                    className="rounded-[var(--radius-input)]"
                  />
                </div>

                {/* Props / Context */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-600 text-[var(--color-ink)]">
                    Props / Context
                  </Label>
                  <Input
                    placeholder="e.g. holding a coffee cup, laptop on desk"
                    value={brief.props}
                    onChange={(e) =>
                      setBrief((b) => ({ ...b, props: e.target.value }))
                    }
                    className="rounded-[var(--radius-input)]"
                  />
                </div>
              </div>

              {/* ── Product Details Section ── */}
              <Separator className="my-6" />
              <div className="mb-1">
                <h3 className="text-base font-700 text-[var(--color-ink)]">
                  Your Product
                </h3>
                <p className="text-sm text-[var(--color-neutral-500)]">
                  Add your product details so the creator's AI persona showcases
                  it in the generated content.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 mt-4">
                {/* Product Name */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-600 text-[var(--color-ink)]">
                    Product Name
                  </Label>
                  <Input
                    placeholder="e.g. Ray-Ban Aviator Classic, boAt Rockerz 450"
                    value={brief.productName}
                    onChange={(e) =>
                      setBrief((b) => ({ ...b, productName: e.target.value }))
                    }
                    className="rounded-[var(--radius-input)]"
                  />
                </div>

                {/* Product Image Upload */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-600 text-[var(--color-ink)]">
                    Product Image
                  </Label>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {brief.productImageUrl ? (
                    /* ── Uploaded preview ── */
                    <div className="relative group">
                      <div className="flex items-center gap-3 rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-2.5">
                        <img
                          src={brief.productImageUrl}
                          alt="Product"
                          className="size-14 shrink-0 rounded-lg border border-[var(--color-neutral-200)] object-contain bg-white"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-600 text-[var(--color-neutral-600)] truncate">
                            Product photo uploaded
                          </p>
                          <p className="text-xs text-[var(--color-neutral-400)]">
                            Visible to creator during approval
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={removeProductImage}
                          className="shrink-0 rounded-full p-1.5 text-[var(--color-neutral-400)] hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Remove image"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Drop zone / upload trigger ── */
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      disabled={productUploading}
                      className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius-input)] border-2 border-dashed p-5 transition-colors cursor-pointer ${
                        isDragging
                          ? "border-[var(--color-gold)] bg-[var(--color-gold)]/5"
                          : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] hover:border-[var(--color-neutral-300)] hover:bg-[var(--color-neutral-100)]"
                      } ${productUploading ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      {productUploading ? (
                        <Loader2 className="size-6 animate-spin text-[var(--color-gold)]" />
                      ) : (
                        <ImagePlus className="size-6 text-[var(--color-neutral-400)]" />
                      )}
                      <span className="text-xs font-500 text-[var(--color-neutral-500)]">
                        {productUploading
                          ? "Uploading..."
                          : "Click or drag photo here"}
                      </span>
                      <span className="text-[10px] text-[var(--color-neutral-400)]">
                        JPEG, PNG, WebP — max 5 MB
                      </span>
                    </button>
                  )}

                  {/* Upload error */}
                  {productUploadError && (
                    <p className="text-xs text-red-500 font-500">
                      {productUploadError}
                    </p>
                  )}
                </div>
              </div>

              {/* Product Description */}
              <div className="flex flex-col gap-2 mt-5">
                <Label className="text-sm font-600 text-[var(--color-ink)]">
                  Product Description
                </Label>
                <textarea
                  placeholder="e.g. Premium gold-frame aviator sunglasses with gradient brown lenses"
                  value={brief.productDescription}
                  onChange={(e) =>
                    setBrief((b) => ({
                      ...b,
                      productDescription: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>

              <Separator className="my-6" />

              {/* Additional notes */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-600 text-[var(--color-ink)]">
                  Additional Notes
                </Label>
                <textarea
                  placeholder="Any extra details or instructions..."
                  value={brief.notes}
                  onChange={(e) =>
                    setBrief((b) => ({ ...b, notes: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>

              {/* Assembled Prompt Preview */}
              <Separator className="my-6" />
              <div className="rounded-[var(--radius-input)] bg-[var(--color-neutral-50)] border border-[var(--color-neutral-200)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="size-4 text-[var(--color-gold)]" />
                  <p className="text-sm font-700 text-[var(--color-ink)]">
                    Prompt Preview
                  </p>
                </div>
                <p className="text-sm text-[var(--color-neutral-600)] leading-relaxed">
                  {assembledPrompt || (
                    <span className="text-[var(--color-neutral-400)]">
                      Fill in the fields above to see your prompt...
                    </span>
                  )}
                </p>
                <p className="mt-2 text-xs text-[var(--color-neutral-400)]">
                  Our AI will enhance this into a professional photography-grade
                  prompt for best results.
                </p>
              </div>

              {/* Step 2 footer */}
              <div className="mt-8 flex justify-between">
                <Button
                  variant="outline"
                  onClick={goBack}
                  className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-500"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
                <Button
                  onClick={goNext}
                  disabled={!step2Valid}
                  className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)] disabled:opacity-50"
                >
                  Next: Review
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════
              STEP 3 — Review & Submit
              ════════════════════════════════════════════ */}
          {step === 2 && (
            <motion.div
              key="step-2"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="p-6"
            >
              <h2 className="text-lg font-700 text-[var(--color-ink)] mb-1">
                Review & Create
              </h2>
              <p className="text-sm text-[var(--color-neutral-500)] mb-6">
                Double-check everything before creating your campaign.
              </p>

              {/* Summary grid */}
              <div className="flex flex-col gap-4">
                {/* Campaign info */}
                <div className="rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] p-4">
                  <p className="text-xs font-600 uppercase tracking-wider text-[var(--color-neutral-400)] mb-3">
                    Campaign
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-[var(--color-neutral-500)]">
                        Name
                      </p>
                      <p className="text-sm font-600 text-[var(--color-ink)]">
                        {campaignName}
                      </p>
                    </div>
                    {description && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-[var(--color-neutral-500)]">
                          Description
                        </p>
                        <p className="text-sm text-[var(--color-ink)]">
                          {description}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-[var(--color-neutral-500)]">
                        Creator
                      </p>
                      <p className="text-sm font-600 text-[var(--color-ink)]">
                        {creatorDisplayName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-neutral-500)]">
                        Max Generations
                      </p>
                      <p className="text-sm font-600 text-[var(--color-ink)]">
                        {maxGenerations}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-neutral-500)]">
                        Total Budget
                      </p>
                      <p className="text-sm font-700 text-[var(--color-gold-hover)]">
                        {formatINR(totalBudget)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Product info */}
                {brief.productName && (
                  <div className="rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] p-4">
                    <p className="text-xs font-600 uppercase tracking-wider text-[var(--color-neutral-400)] mb-3">
                      Product
                    </p>
                    <div className="flex items-start gap-4">
                      {brief.productImageUrl && (
                        <img
                          src={brief.productImageUrl}
                          alt={brief.productName}
                          className="size-14 shrink-0 rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] object-contain bg-white"
                        />
                      )}
                      <div>
                        <p className="text-sm font-600 text-[var(--color-ink)]">
                          {brief.productName}
                        </p>
                        {brief.productDescription && (
                          <p className="text-xs text-[var(--color-neutral-500)] mt-1">
                            {brief.productDescription}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Prompt preview */}
                <div className="rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="size-4 text-[var(--color-gold)]" />
                    <p className="text-xs font-600 uppercase tracking-wider text-[var(--color-neutral-400)]">
                      AI Prompt
                    </p>
                  </div>
                  <p className="text-sm text-[var(--color-ink)] leading-relaxed">
                    {assembledPrompt}
                  </p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 rounded-[var(--radius-input)] border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Step 3 footer */}
              <div className="mt-8 flex justify-between">
                <Button
                  variant="outline"
                  onClick={goBack}
                  disabled={submitting}
                  className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-500"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="size-4" />
                      Create Campaign
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
