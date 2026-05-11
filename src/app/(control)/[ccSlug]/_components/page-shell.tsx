/**
 * Shared page shell for Control Centre module pages.
 * Use to keep page chrome consistent without re-typing the header markup.
 */

import { notFound } from "next/navigation";
import { verifySlug } from "@/lib/cc/guard";

/**
 * Back-compat shim. Auth is now enforced by `[ccSlug]/layout.tsx` (single
 * source of truth — having two call sites raced and produced the
 * "sidebar hidden but content visible" bug). This function now only
 * defends the slug, so pages that still call it don't break.
 */
export async function ensureCCAuth(ccSlug: string): Promise<void> {
  if (!verifySlug(ccSlug)) {
    notFound();
  }
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="cc-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="cc-row">{actions}</div>}
    </div>
  );
}

export function ComingSoon({
  module,
  description,
}: {
  module: string;
  description: string;
}) {
  return (
    <div className="cc-coming-soon">
      <h3>{module}</h3>
      <p style={{ margin: "4px 0 0 0", fontSize: 12.5 }}>{description}</p>
      <p style={{ marginTop: 14, fontSize: 11, fontFamily: "var(--cc-mono)", letterSpacing: "0.08em" }}>
        SHIPPING IN A FOLLOW-UP — FOUNDATION + OPS ARE LIVE NOW
      </p>
    </div>
  );
}
