"use client";

/**
 * New Generation page (scoped to an existing campaign).
 *
 * Reached from /dashboard/campaigns/[id] → "New Generation" button.
 * Collects the structured brief and POSTs to /api/generations/create,
 * reusing the campaign's creator + budget + category pricing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  ImagePlus,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/* ================================================================
   Types
   ================================================================ */

interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  budget_paise: number;
  spent_paise: number;
  generation_count: number;
  max_generations: number;
  creator_id: string;
  creator_display_name: string;
}

interface CategoryOption {
  category: string;
  price_per_generation_paise: number;
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
   Page
   ================================================================ */

export default function NewGenerationPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params?.id;
  const router = useRouter();

  /* Loading / data */
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  /* Brief */
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

  /* Product upload */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [productUploading, setProductUploading] = useState(false);
  const [productUploadError, setProductUploadError] = useState<string | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

  /* Submission */
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ── Load campaign + creator categories ── */
  const loadCampaign = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setLoadError(null);

    try {
      const [campRes, creatorsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" }),
        fetch(`/api/creators`, { cache: "no-store" }),
      ]);

      if (!campRes.ok) {
        const err = await campRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load campaign");
      }

      const campData = (await campRes.json()) as {
        campaign: CampaignSummary;
      };
      setCampaign(campData.campaign);

      // Find this campaign's creator in the creators list to pull categories
      if (creatorsRes.ok) {
        const creatorsData = (await creatorsRes.json()) as {
          creators: Array<{
            id: string;
            categories: CategoryOption[];
          }>;
        };
        const match = creatorsData.creators.find(
          (c) => c.id === campData.campaign.creator_id
        );
        const cats = match?.categories ?? [];
        setCategories(cats);
        if (cats.length > 0) {
          setSelectedCategory(cats[0].category);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  /* ── Product image upload ── */
  async function uploadProductImage(file: File) {
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
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
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

  /* ── Derived ── */
  const creatorName = campaign?.creator_display_name ?? "[creator]";
  const selectedCat = categories.find((c) => c.category === selectedCategory);
  const pricePaise = selectedCat?.price_per_generation_paise ?? 0;
  const remainingBudget = campaign
    ? campaign.budget_paise - campaign.spent_paise
    : 0;
  const remainingSlots = campaign
    ? campaign.max_generations - campaign.generation_count
    : 0;

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
    if (setting) parts.push(setting.toLowerCase());
    parts.push(`photo of ${creatorName}`);
    if (pose) parts.push(pose.toLowerCase());
    if (expression) parts.push(`with a ${expression.toLowerCase()} expression`);
    if (brief.outfit) parts.push(`, ${brief.outfit}`);
    if (brief.productName) parts.push(`, showcasing ${brief.productName}`);
    if (brief.productDescription) parts.push(`(${brief.productDescription})`);
    if (brief.props) parts.push(`, ${brief.props}`);
    if (brief.notes) parts.push(`. ${brief.notes}`);

    return parts.join(" ").replace(/\s{2,}/g, " ").replace(/ ,/g, ",");
  }, [brief, creatorName]);

  /* ── Validation ── */
  const canSubmit =
    !!campaign &&
    !!selectedCategory &&
    brief.style.length > 0 &&
    pricePaise > 0 &&
    pricePaise <= remainingBudget &&
    remainingSlots > 0;

  /* ── Submit ── */
  async function handleSubmit() {
    if (!campaign) return;
    setSubmitting(true);
    setSubmitError(null);

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
      subject: creatorName,
      category: selectedCategory,
      product_name: brief.productName || null,
      product_description: brief.productDescription || null,
      product_image_url: brief.productImageUrl || null,
    };

    try {
      const res = await fetch("/api/generations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.id,
          structured_brief: structuredBrief,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create generation");
      }
      router.push(`/dashboard/generations/${data.generation_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  /* ── Render ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-[var(--color-gold)]" />
      </div>
    );
  }

  if (loadError || !campaign) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-600 text-red-700 mb-2">
            Couldn&apos;t load campaign
          </p>
          <p className="text-sm text-red-600 mb-4">
            {loadError ?? "Campaign not found"}
          </p>
          <Link
            href="/dashboard/campaigns"
            className="text-sm font-600 text-[var(--color-gold)] hover:underline"
          >
            ← Back to Campaigns
          </Link>
        </div>
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
      <Link
        href={`/dashboard/campaigns/${campaign.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-500 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] mb-6 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to {campaign.name}
      </Link>

      <h1 className="text-3xl font-800 tracking-tight text-[var(--color-ink)] mb-2">
        New Generation
      </h1>
      <p className="text-[var(--color-neutral-500)] mb-8">
        Creating a generation for <strong>{creatorName}</strong> in the{" "}
        <strong>{campaign.name}</strong> campaign.
      </p>

      {/* Campaign context strip */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <div className="rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] p-3">
          <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-1">
            Remaining Budget
          </p>
          <p className="text-sm font-700 text-[var(--color-ink)]">
            {formatINR(remainingBudget)}
          </p>
        </div>
        <div className="rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] p-3">
          <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-1">
            Generations Left
          </p>
          <p className="text-sm font-700 text-[var(--color-ink)]">
            {remainingSlots} / {campaign.max_generations}
          </p>
        </div>
        <div className="rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] p-3">
          <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)] mb-1">
            This Generation
          </p>
          <p className="text-sm font-700 text-[var(--color-gold-hover)]">
            {pricePaise > 0 ? formatINR(pricePaise) : "—"}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-6">
        <h2 className="text-lg font-700 text-[var(--color-ink)] mb-1">
          Guided Prompt Builder
        </h2>
        <p className="text-sm text-[var(--color-neutral-500)] mb-6">
          Describe the content you want generated.
        </p>

        {/* Category picker (required to determine price) */}
        {categories.length > 1 && (
          <div className="flex flex-col gap-2 mb-5">
            <Label className="text-sm font-600 text-[var(--color-ink)]">
              Category <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-9 w-full appearance-none rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-1 pr-8 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category} — {formatINR(c.price_per_generation_paise)} /
                    gen
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-neutral-400)]" />
            </div>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
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
          <SelectField
            label="Pose / Action"
            value={brief.pose}
            options={POSES}
            onChange={(v) => setBrief((b) => ({ ...b, pose: v }))}
            customValue={brief.poseCustom}
            onCustomChange={(v) => setBrief((b) => ({ ...b, poseCustom: v }))}
          />
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
          <SelectField
            label="Style"
            value={brief.style}
            options={STYLES}
            onChange={(v) => setBrief((b) => ({ ...b, style: v }))}
          />

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

        {/* Product */}
        <Separator className="my-6" />
        <h3 className="text-base font-700 text-[var(--color-ink)] mb-1">
          Your Product
        </h3>
        <p className="text-sm text-[var(--color-neutral-500)] mb-4">
          Add your product details so the creator&apos;s AI persona showcases
          it.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-600 text-[var(--color-ink)]">
              Product Name
            </Label>
            <Input
              placeholder="e.g. Pourfect Coffee"
              value={brief.productName}
              onChange={(e) =>
                setBrief((b) => ({ ...b, productName: e.target.value }))
              }
              className="rounded-[var(--radius-input)]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-600 text-[var(--color-ink)]">
              Product Image
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            {brief.productImageUrl ? (
              <div className="flex items-center gap-3 rounded-[var(--radius-input)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brief.productImageUrl}
                  alt="Product"
                  className="size-14 shrink-0 rounded-lg border border-[var(--color-neutral-200)] object-contain bg-white"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-600 text-[var(--color-neutral-600)] truncate">
                    Product photo uploaded
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removeProductImage}
                  className="shrink-0 rounded-full p-1.5 text-[var(--color-neutral-400)] hover:text-red-500 hover:bg-red-50"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
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
                    : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] hover:border-[var(--color-neutral-300)]"
                } ${productUploading ? "opacity-60 pointer-events-none" : ""}`}
              >
                {productUploading ? (
                  <Loader2 className="size-6 animate-spin text-[var(--color-gold)]" />
                ) : (
                  <ImagePlus className="size-6 text-[var(--color-neutral-400)]" />
                )}
                <span className="text-xs font-500 text-[var(--color-neutral-500)]">
                  {productUploading ? "Uploading..." : "Click or drag photo"}
                </span>
                <span className="text-[10px] text-[var(--color-neutral-400)]">
                  JPEG, PNG, WebP — max 5 MB
                </span>
              </button>
            )}
            {productUploadError && (
              <p className="text-xs text-red-500 font-500">
                {productUploadError}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-5">
          <Label className="text-sm font-600 text-[var(--color-ink)]">
            Product Description
          </Label>
          <textarea
            placeholder="Bright yellow aluminum can, matte finish, bold black wordmark, steam rising..."
            value={brief.productDescription}
            onChange={(e) =>
              setBrief((b) => ({
                ...b,
                productDescription: e.target.value,
              }))
            }
            rows={2}
            className="w-full rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col gap-2">
          <Label className="text-sm font-600 text-[var(--color-ink)]">
            Additional Notes
          </Label>
          <textarea
            placeholder="Any extra details or instructions..."
            value={brief.notes}
            onChange={(e) => setBrief((b) => ({ ...b, notes: e.target.value }))}
            rows={2}
            className="w-full rounded-[var(--radius-input)] border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>

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
                Fill in the fields to see your prompt...
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-[var(--color-neutral-400)]">
            Our AI enhances this into a photography-grade prompt.
          </p>
        </div>

        {submitError && (
          <div className="mt-4 rounded-[var(--radius-input)] border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        {remainingSlots <= 0 && (
          <div className="mt-4 rounded-[var(--radius-input)] border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-700">
              This campaign has reached its max generations.
            </p>
          </div>
        )}

        {pricePaise > remainingBudget && (
          <div className="mt-4 rounded-[var(--radius-input)] border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-700">
              Remaining campaign budget ({formatINR(remainingBudget)}) is less
              than the cost of this generation ({formatINR(pricePaise)}).
            </p>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}
            disabled={submitting}
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-500"
          >
            <ArrowLeft className="size-4" />
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-[var(--radius-button)] bg-[var(--color-gold)] font-600 text-white hover:bg-[var(--color-gold-hover)] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Create Generation
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
