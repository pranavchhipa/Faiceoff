/**
 * Shared page shell for Control Centre module pages.
 * Use to keep page chrome consistent without re-typing the header markup.
 */

import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/cc/session";
import { verifySlug } from "@/lib/cc/guard";

export async function ensureCCAuth(ccSlug: string): Promise<void> {
  if (!verifySlug(ccSlug)) {
    redirect("/");
  }
  const session = await getCurrentSession();
  if (!session) {
    redirect(`/${ccSlug}/login`);
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
