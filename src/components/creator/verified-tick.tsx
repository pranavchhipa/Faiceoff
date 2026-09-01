"use client";

/**
 * VerifiedTick — the gold tick, wherever a verified creator's identity is shown.
 *
 * Verification used to be invisible: `creators.is_verified` was read by the
 * /creator/verify page and the brand's creator-detail view and nowhere else,
 * so a creator who had just been approved (and told "your gold tick is live")
 * saw no tick anywhere in their own workspace. This renders it from the same
 * cached /api/creator/verification the banner uses, so the two can never
 * disagree, and returns null for brands/admins and unverified creators.
 */

import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";
import {
  VerifiedCheck,
  VerifiedAvatarBadge,
} from "@/components/ui/verified-seal";
import type { Role } from "@/config/routes";

interface VState {
  is_verified: boolean;
  status: "not_started" | "pending" | "verified" | "rejected";
}

export function useIsVerifiedCreator(role: Role | null): boolean {
  // Only creators can hold this badge — skip the fetch entirely otherwise.
  const { data } = useCachedFetch<VState>(
    role === "creator" ? "/api/creator/verification" : null,
  );
  return Boolean(data?.is_verified || data?.status === "verified");
}

/** Inline check beside a name. Uses the small-size mark, not the petal seal. */
export function VerifiedTick({
  role,
  size = 15,
  className = "",
}: {
  role: Role | null;
  size?: number;
  className?: string;
}) {
  const verified = useIsVerifiedCreator(role);
  if (!verified) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center ${className}`}
      title="Faiceoff Verified Creator"
    >
      <VerifiedCheck size={size} />
    </span>
  );
}

/**
 * Corner badge for an avatar. The parent must be `relative` — this positions
 * itself bottom-right and overlaps the avatar edge slightly.
 */
export function VerifiedAvatarTick({
  role,
  size = 12,
  ringColor,
}: {
  role: Role | null;
  size?: number;
  ringColor?: string;
}) {
  const verified = useIsVerifiedCreator(role);
  if (!verified) return null;

  return (
    <span className="pointer-events-none absolute -bottom-0.5 -right-0.5">
      <VerifiedAvatarBadge size={size} ringColor={ringColor} />
    </span>
  );
}
