"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  SETTING_OPTIONS,
  TIME_LIGHTING_OPTIONS,
  MOOD_PALETTE_OPTIONS,
  INTERACTION_OPTIONS,
  POSE_ENERGY_OPTIONS,
  EXPRESSION_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  CAMERA_FRAMING_OPTIONS,
  ASPECT_RATIO_OPTIONS,
} from "@/config/campaign-options";
import { PillSection } from "./pill-section";

interface Creator {
  id: string;
  display_name: string;
  hero_photo_url: string | null;
  avatar_url: string | null;
  categories: { id: string; category: string; price_per_generation_paise: number }[];
}

interface Props {
  creator: Creator;
  minPrice: number | null;
  onClose: () => void;
}

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const DRAFT_VERSION = 1;
type Draft = {
  v: number;
  campaignName: string;
  categoryId: string;
  productUrl: string | null;
  productName: string;
  setting: string | null;
  timeLighting: string | null;
  moodPalette: string | null;
  interaction: string | null;
  poseEnergy: string | null;
  expression: string | null;
  outfitStyle: string | null;
  cameraFraming: string | null;
  aspectRatio: string;
  count: number;
  customNotes: string;
};

function draftKey(creatorId: string) {
  return `faiceoff:campaign-draft:${creatorId}`;
}

export function StartCampaignSheet({ creator, minPrice, onClose }: Props) {
  const router = useRouter();
  const storageKey = draftKey(creator.id);

  // Load draft synchronously on first render so inputs hydrate in-place.
  const initial = useRef<Partial<Draft>>({});
  if (initial.current && Object.keys(initial.current).length === 0 && typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Draft;
        if (parsed?.v === DRAFT_VERSION) initial.current = parsed;
      }
    } catch {
      // ignore corrupted draft
    }
  }
  const d = initial.current;

  const [campaignName, setCampaignName] = useState(d.campaignName ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    d.categoryId ?? creator.categories[0]?.id ?? "",
  );
  const selectedCategory = creator.categories.find((c) => c.id === categoryId) ?? creator.categories[0];
  const pricePaise = selectedCategory?.price_per_generation_paise ?? minPrice ?? 0;

  const [productFile, setProductFile] = useState<File | null>(null);
  const [productUrl, setProductUrl] = useState<string | null>(d.productUrl ?? null);
  const [productName, setProductName] = useState(d.productName ?? "");

  const [setting, setSetting] = useState<string | null>(d.setting ?? null);
  const [timeLighting, setTimeLighting] = useState<string | null>(d.timeLighting ?? null);
  const [moodPalette, setMoodPalette] = useState<string | null>(d.moodPalette ?? null);
  const [interaction, setInteraction] = useState<string | null>(d.interaction ?? null);
  const [poseEnergy, setPoseEnergy] = useState<string | null>(d.poseEnergy ?? null);
  const [expression, setExpression] = useState<string | null>(d.expression ?? null);
  const [outfitStyle, setOutfitStyle] = useState<string | null>(d.outfitStyle ?? null);
  const [cameraFraming, setCameraFraming] = useState<string | null>(d.cameraFraming ?? null);
  const [aspectRatio, setAspectRatio] = useState<string>(d.aspectRatio ?? "1:1");
  const [count, setCount] = useState<number>(d.count ?? 5);
  const [customNotes, setCustomNotes] = useState(d.customNotes ?? "");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState<boolean>(
    Object.keys(d).length > 0,
  );

  const photo = creator.hero_photo_url ?? creator.avatar_url ?? "";
  const total = pricePaise * count;

  // Autosave draft on any change (debounced via React's batching + effect).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft: Draft = {
      v: DRAFT_VERSION,
      campaignName,
      categoryId,
      productUrl,
      productName,
      setting,
      timeLighting,
      moodPalette,
      interaction,
      poseEnergy,
      expression,
      outfitStyle,
      cameraFraming,
      aspectRatio,
      count,
      customNotes,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // quota exceeded or private mode — safe to ignore
    }
  }, [
    storageKey,
    campaignName,
    categoryId,
    productUrl,
    productName,
    setting,
    timeLighting,
    moodPalette,
    interaction,
    poseEnergy,
    expression,
    outfitStyle,
    cameraFraming,
    aspectRatio,
    count,
    customNotes,
  ]);

  function clearDraft() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }

  function hasUnsavedInput() {
    return Boolean(
      campaignName.trim() ||
        productUrl ||
        productName.trim() ||
        setting ||
        timeLighting ||
        moodPalette ||
        interaction ||
        poseEnergy ||
        expression ||
        outfitStyle ||
        cameraFraming ||
        customNotes.trim(),
    );
  }

  function attemptClose() {
    if (hasUnsavedInput()) {
      const ok = window.confirm(
        "Close this campaign? Your inputs are saved as a draft and will be restored next time.",
      );
      if (!ok) return;
    }
    onClose();
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (isUploading) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setProductFile(file);
    setIsUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file); // endpoint expects "image"
      const res = await fetch("/api/campaigns/upload-product-image", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Upload failed (${res.status}): ${body}`);
      }
      const { url } = (await res.json()) as { url: string };
      setProductUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function onGenerate() {
    if (pricePaise <= 0) {
      setError("This creator has no active pricing — cannot start campaign");
      return;
    }
    if (!productUrl) {
      setError("Upload a product image first");
      return;
    }
    if (!productName.trim()) {
      setError("Enter the exact product name");
      return;
    }
    if (!campaignName.trim()) {
      setError("Enter a campaign name");
      return;
    }
    if (!selectedCategory) {
      setError("Select a category");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const brief = {
        product_name: productName.trim(),
        product_image_url: productUrl,
        setting,
        time_lighting: timeLighting,
        mood_palette: moodPalette,
        interaction,
        pose_energy: poseEnergy,
        expression,
        outfit_style: outfitStyle,
        camera_framing: cameraFraming,
        aspect_ratio: aspectRatio,
        custom_notes: customNotes.trim() || null,
        _meta: {
          creator_id: creator.id,
          category: selectedCategory.category,
        },
      };
      const res = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: creator.id,
          campaign_name: campaignName.trim(),
          count,
          price_per_generation_paise: pricePaise,
          structured_brief: brief,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Campaign create failed (${res.status}): ${body}`);
      }
      const { campaign_id } = (await res.json()) as { campaign_id: string };
      clearDraft();
      router.push(`/dashboard/campaigns/${campaign_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={attemptClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[760px] flex-col overflow-hidden bg-white shadow-2xl"
      >
        {/* HEADER */}
        <div className="flex items-center gap-3 border-b border-[var(--color-neutral-100)] bg-[var(--color-paper)] px-6 py-4">
          {photo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo}
              alt=""
              className="size-11 rounded-full object-cover object-top"
            />
          )}
          <div className="flex-1">
            <p className="text-sm font-700 text-[var(--color-ink)]">
              New Campaign with {creator.display_name}
            </p>
            <p className="text-xs text-[var(--color-neutral-500)]">
              {creator.categories[0]?.category ?? "—"} • {formatINR(pricePaise)} per image
            </p>
          </div>
          <button
            onClick={attemptClose}
            className="text-xl text-[var(--color-neutral-400)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {draftRestored && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--color-mint)] px-3.5 py-2.5 text-xs">
              <div>
                <strong>Draft restored.</strong> Your previous inputs were saved automatically.
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Discard the saved draft and start fresh?")) return;
                  clearDraft();
                  setCampaignName("");
                  setCategoryId(creator.categories[0]?.id ?? "");
                  setProductUrl(null);
                  setProductName("");
                  setSetting(null);
                  setTimeLighting(null);
                  setMoodPalette(null);
                  setInteraction(null);
                  setPoseEnergy(null);
                  setExpression(null);
                  setOutfitStyle(null);
                  setCameraFraming(null);
                  setAspectRatio("1:1");
                  setCount(5);
                  setCustomNotes("");
                  setDraftRestored(false);
                }}
                className="shrink-0 rounded-full border border-[var(--color-ink)]/20 bg-white px-2.5 py-1 text-[11px] font-600 text-[var(--color-ink)]"
              >
                Discard
              </button>
            </div>
          )}

          <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-[var(--color-lilac)] px-3.5 py-3 text-xs">
            <span>✨</span>
            <div>
              <strong>Click-based customization.</strong> Skip any pill to let the AI infer it from the creator&apos;s style.{" "}
              <span className="text-[var(--color-neutral-500)]">Inputs autosave — accidental close se nothing is lost.</span>
            </div>
          </div>

          {/* CAMPAIGN NAME */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">
                🏷️
              </span>
              Campaign name{" "}
              <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">
                • Required
              </span>
            </div>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value.slice(0, 80))}
              placeholder="e.g. boAt Rockerz 255 — Rooftop Session"
              className="w-full rounded-lg border border-[var(--color-neutral-100)] px-3 py-2.5 text-sm"
            />
          </div>

          {/* CATEGORY */}
          {creator.categories.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
                <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">
                  🧩
                </span>
                Category{" "}
                <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">
                  • Required — sets per-image price
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {creator.categories.map((c) => {
                  const active = c.id === categoryId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-600 ${
                        active
                          ? "border-[var(--color-gold)] bg-[#fdf6e7] text-[var(--color-ink)]"
                          : "border-[var(--color-neutral-100)] text-[var(--color-neutral-600)]"
                      }`}
                    >
                      {c.category}
                      <span className="ml-1.5 text-[10px] font-400 text-[var(--color-neutral-400)]">
                        {formatINR(c.price_per_generation_paise)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PRODUCT */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">
                📦
              </span>
              Product{" "}
              <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">
                • Required
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-[var(--color-neutral-100)] bg-[var(--color-paper)] p-2.5">
              <div className="size-14 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--color-neutral-100)]">
                {productUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={productUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-[var(--color-neutral-400)]">
                    Upload
                  </span>
                )}
              </div>
              <div className="flex-1 text-sm">
                <p className="font-600 text-[var(--color-ink)]">
                  {productFile?.name ?? "Choose product image"}
                </p>
                <p className="text-xs text-[var(--color-neutral-400)]">
                  {isUploading ? "Uploading…" : productUrl ? "✓ Uploaded" : "PNG / JPG, up to 5MB"}
                </p>
              </div>
              <input type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={onUpload} />
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Exact product name (as printed on pack)"
              className="mt-2 w-full rounded-lg border border-[var(--color-neutral-100)] px-3 py-2.5 text-sm"
            />
          </div>

          <p className="mb-3 text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)]">
            Scene & environment
          </p>
          <PillSection icon="🏠" label="Setting" options={SETTING_OPTIONS} value={setting} onChange={setSetting} />
          <PillSection icon="☀️" label="Time & lighting" options={TIME_LIGHTING_OPTIONS} value={timeLighting} onChange={setTimeLighting} />
          <PillSection icon="🎨" label="Mood & palette" options={MOOD_PALETTE_OPTIONS} value={moodPalette} onChange={setMoodPalette} />

          <p className="mb-3 mt-6 text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)]">
            Subject & pose
          </p>
          <PillSection icon="🤲" label="Interaction with product" options={INTERACTION_OPTIONS} value={interaction} onChange={setInteraction} />
          <PillSection icon="💃" label="Pose & energy" options={POSE_ENERGY_OPTIONS} value={poseEnergy} onChange={setPoseEnergy} />
          <PillSection icon="😊" label="Expression" options={EXPRESSION_OPTIONS} value={expression} onChange={setExpression} />
          <PillSection icon="👗" label="Outfit style" options={OUTFIT_STYLE_OPTIONS} value={outfitStyle} onChange={setOutfitStyle} />

          <p className="mb-3 mt-6 text-[10px] font-700 uppercase tracking-widest text-[var(--color-neutral-400)]">
            Camera & output
          </p>
          <PillSection icon="📷" label="Camera & framing" options={CAMERA_FRAMING_OPTIONS} value={cameraFraming} onChange={setCameraFraming} />

          {/* ASPECT — no custom */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">
                📐
              </span>
              Platform & aspect
            </div>
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIO_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setAspectRatio(o.key)}
                  className={`rounded-lg border px-2 py-2.5 text-center text-xs ${
                    aspectRatio === o.key
                      ? "border-[var(--color-gold)] bg-[#fdf6e7] font-600 text-[var(--color-ink)]"
                      : "border-[var(--color-neutral-100)] text-[var(--color-neutral-600)]"
                  }`}
                >
                  <b className="block text-xs">{o.key}</b>
                  <span className="text-[10px] text-[var(--color-neutral-400)]">
                    {o.label.replace(`${o.key} `, "")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* COUNT */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">
                🔢
              </span>
              How many images?
            </div>
            <div className="flex items-center gap-3.5 rounded-lg border border-[var(--color-neutral-100)] bg-[var(--color-paper)] px-3.5 py-2.5">
              <button
                type="button"
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="size-8 rounded-lg border border-[var(--color-neutral-100)] bg-white text-sm font-700"
              >
                −
              </button>
              <span className="min-w-[36px] text-center text-xl font-700 text-[var(--color-ink)]">
                {count}
              </span>
              <button
                type="button"
                onClick={() => setCount((c) => Math.min(50, c + 1))}
                className="size-8 rounded-lg border border-[var(--color-neutral-100)] bg-white text-sm font-700"
              >
                +
              </button>
              <div className="flex-1 text-right text-xs text-[var(--color-neutral-400)]">
                {formatINR(pricePaise)} × {count}
                <br />
                <b className="text-sm font-700 text-[var(--color-ink)]">{formatINR(total)}</b>
              </div>
            </div>
          </div>

          <div className="my-6 h-px bg-[var(--color-neutral-100)]" />

          {/* CUSTOM NOTES */}
          <div className="mb-2">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
              <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)]">
                ✍️
              </span>
              Custom notes
              <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">
                • Optional — edge cases, brand refs, do-not-do
              </span>
            </div>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="e.g. 'No sunglasses', 'Pack label must be visible'"
              className="w-full resize-y rounded-lg border border-[var(--color-neutral-100)] px-3 py-2.5 text-sm"
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between border-t border-[var(--color-neutral-100)] bg-[var(--color-paper)] px-6 py-4">
          <div className="text-xs text-[var(--color-neutral-500)]">
            Total
            <br />
            <b className="text-lg font-800 text-[var(--color-ink)]">{formatINR(total)}</b>
          </div>
          <button
            type="button"
            disabled={isSubmitting || isUploading}
            onClick={onGenerate}
            className="rounded-[var(--radius-button)] bg-[var(--color-gold)] px-6 py-3 font-700 text-white shadow-lg disabled:opacity-60"
          >
            {isSubmitting ? "Creating…" : "Generate Images →"}
          </button>
        </div>
      </div>
    </div>
  );
}
