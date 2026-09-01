/**
 * How many generation credits a collab package grants per FINAL image.
 *
 * A package sells N approved images; the brand needs headroom above N because
 * not every render is a keeper (scene tweaks, retries, discards). This
 * multiplier is that headroom.
 *
 * Single source of truth on purpose: this number was previously hardcoded as
 * `* 3` in seven places — two package routes, confirm-payment, the Razorpay
 * webhook, the agreement terms, and two UI labels — so changing it meant
 * finding all seven and the ones you missed silently disagreed with the ones
 * you found (the agreement PDF could promise a different credit count than
 * the session actually granted).
 *
 * 2026-09-01: lowered 3 → 2. Every retry now costs a credit (the free-retry
 * path is gone), so the old 3× headroom was over-provisioned.
 */
export const GENERATION_CREDITS_PER_IMAGE = 2;

/** Credits a package grants for `finalImages` deliverables. */
export function generationCreditsFor(finalImages: number): number {
  return finalImages * GENERATION_CREDITS_PER_IMAGE;
}
