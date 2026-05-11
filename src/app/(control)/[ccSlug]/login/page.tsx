/**
 * Control Centre login — single TOTP code entry.
 *
 * The parent layout (`[ccSlug]/layout.tsx`) is the source of truth for
 * routing: it redirects to /setup if no TOTP exists and to /ops if a
 * session is already active. By the time this page renders, we know
 * TOTP exists and the user is not authenticated.
 */

import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

export default async function CCLoginPage({ params }: Props) {
  const { ccSlug } = await params;
  return (
    <div className="cc-auth-shell">
      <LoginForm ccSlug={ccSlug} />
    </div>
  );
}
