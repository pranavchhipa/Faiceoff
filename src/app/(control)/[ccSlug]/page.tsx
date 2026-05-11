/**
 * Control Centre entry — by the time this page runs, the layout has
 * already verified the slug + TOTP + session. So we always punt to /ops.
 *
 *   • No TOTP    → layout redirects to /setup before we get here
 *   • No session → layout redirects to /login before we get here
 *   • Authed     → fall through, redirect to the real home
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

export default async function CCEntryPage({ params }: Props) {
  const { ccSlug } = await params;
  redirect(`/${ccSlug}/ops`);
}
