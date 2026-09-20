/**
 * Shared helpers for the Control Centre generations gallery + detail page.
 * Lives in its own module because Next.js page files must only export the
 * default component plus the recognised route-config fields.
 */

/** Every value allowed by generations_status_check (migration 00076). */
export const GEN_STATUSES = [
  "draft",
  "compliance_check",
  "generating",
  "output_check",
  "ready_for_brand_review",
  "ready_for_approval",
  "approved",
  "rejected",
  "failed",
  "discarded",
  "needs_admin_review",
] as const;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Money is stored in paise everywhere in this codebase. */
export function fmtMoney(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function relativeFrom(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN");
}

export function statusPillClass(status: string): string {
  switch (status) {
    case "approved":
      return "cc-pill-ok";
    case "rejected":
    case "failed":
      return "cc-pill-bad";
    case "needs_admin_review":
    case "compliance_check":
    case "generating":
    case "output_check":
      return "cc-pill-warn";
    case "ready_for_approval":
    case "ready_for_brand_review":
      return "cc-pill-info";
    default:
      return "cc-pill-neutral";
  }
}

export function approvalPillClass(status: string | null | undefined): string {
  switch (status) {
    case "approved":
      return "cc-pill-ok";
    case "rejected":
      return "cc-pill-bad";
    case "expired":
      return "cc-pill-warn";
    case "pending":
    case "revision_requested":
      return "cc-pill-info";
    default:
      return "cc-pill-neutral";
  }
}

/**
 * Human labels for the Studio brief fields (see the Brief interface in
 * brand/collabs/[id]/studio/page.tsx). Anything not listed falls back to a
 * de-snake_cased version of the key, so a new Studio field still renders.
 */
export const BRIEF_LABELS: Record<string, string> = {
  product_name: "Product",
  product_description: "Product description",
  product_image_url: "Product image",
  pack_text: "Pack text (locked copy)",
  label_bbox: "Label bounding box",
  high_detail_mode: "High detail mode",
  category: "Category",
  setting: "Setting",
  time_lighting: "Time & lighting",
  mood_palette: "Mood & palette",
  interaction: "Interaction",
  pose_energy: "Pose energy",
  expression: "Expression",
  outfit_style: "Outfit style",
  camera_framing: "Camera framing",
  camera_type: "Camera type",
  aspect_ratio: "Aspect ratio",
  custom_notes: "Custom notes",
  concept: "Concept",
  title: "Title",
};

export function humanKey(key: string): string {
  if (BRIEF_LABELS[key]) return BRIEF_LABELS[key];
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** True for a string that we're willing to render as an <img src>. */
export function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
