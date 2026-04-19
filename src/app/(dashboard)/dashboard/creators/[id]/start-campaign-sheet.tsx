"use client";

import { useState } from "react";
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

export function StartCampaignSheet({ creator, minPrice, onClose }: Props) {
  const router = useRouter();
  const pricePaise = minPrice ?? 0;

  const [productFile, setProductFile] = useState<File | null>(null);
  const [productUrl, setProductUrl] = useState<string | null>(null);
  const [productName, setProductName] = useState("");

  const [setting, setSetting] = useState<string | null>(null);
  const [timeLighting, setTimeLighting] = useState<string | null>(null);
  const [moodPalette, setMoodPalette] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<string | null>(null);
  const [poseEnergy, setPoseEnergy] = useState<string | null>(null);
  const [expression, setExpression] = useState<string | null>(null);
  const [outfitStyle, setOutfitStyle] = useState<string | null>(null);
  const [cameraFraming, setCameraFraming] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [count, setCount] = useState(5);
  const [customNotes, setCustomNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photo = creator.hero_photo_url ?? creator.avatar_url ?? "";
  const total = pricePaise * count;

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
    if (!productUrl) {
      setError("Upload a product image first");
      return;
    }
    if (!productName.trim()) {
      setError("Enter the exact product name");
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
          category: creator.categories[0]?.category ?? "general",
        },
      };
      const res = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: creator.id,
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
      onClick={onClose}
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
            onClick={onClose}
            className="text-xl text-[var(--color-neutral-400)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-[var(--color-lilac)] px-3.5 py-3 text-xs">
            <span>✨</span>
            <div>
              <strong>Click-based customization.</strong> Pills skip karega → AI creator ke style se infer karega.
            </div>
          </div>

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
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
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
