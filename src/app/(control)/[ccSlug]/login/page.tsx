/**
 * Control Centre login — single TOTP code entry.
 *
 *   • If TOTP not yet configured → bounce to /setup.
 *   • If already authenticated → bounce to /ops.
 *   • Otherwise render the 6-digit input form.
 */

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/lib/cc/session";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

export default async function CCLoginPage({ params }: Props) {
  const { ccSlug } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { count } = await admin
    .from("owner_totp")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) === 0) {
    redirect(`/${ccSlug}/setup`);
  }

  const session = await getCurrentSession();
  if (session) {
    redirect(`/${ccSlug}/ops`);
  }

  return (
    <div className="cc-auth-shell">
      <LoginForm ccSlug={ccSlug} />
    </div>
  );
}
