/**
 * Control Centre entry — pure router.
 *   • No TOTP set up yet → /setup
 *   • TOTP set, no session → /login
 *   • Authenticated → /ops (the real dashboard home)
 */

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

export default async function CCEntryPage({ params }: Props) {
  const { ccSlug } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { count } = await admin
    .from("owner_totp")
    .select("id", { count: "exact", head: true });
  const hasTotp = (count ?? 0) > 0;

  if (!hasTotp) {
    redirect(`/${ccSlug}/setup`);
  }

  const session = await getCurrentSession();
  if (!session) {
    redirect(`/${ccSlug}/login`);
  }

  redirect(`/${ccSlug}/ops`);
}
