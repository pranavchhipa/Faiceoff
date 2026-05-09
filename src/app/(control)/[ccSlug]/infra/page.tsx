import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function InfraPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Infra & cost" subtitle="Vercel · Supabase · R2 · Razorpay · Gemini · Resend · Sentry · PostHog · Upstash" />
      <ComingSoon
        module="Infrastructure dashboard"
        description="Per-service health + monthly spend + projected cost, top errors from Sentry, event volume from PostHog, R2 egress, Gemini token usage."
      />
    </>
  );
}
