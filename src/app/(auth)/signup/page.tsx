import { redirect } from "next/navigation";

/**
 * /signup — canonical signup entry.
 *
 * Every marketing/SEO CTA links here with ?role=brand|creator; the real
 * forms live at /auth/signup/<role>. This route existed only in the links
 * (404) until now — the single most-clicked CTA on the site was dead.
 */
export default async function SignupRedirect({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  redirect(role === "brand" ? "/auth/signup/brand" : "/auth/signup/creator");
}
