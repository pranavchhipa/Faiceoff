import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function ConfigPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="System configuration" subtitle="Feature flags · maintenance mode · cron · rate limits" />
      <ComingSoon
        module="System configuration"
        description="Feature flags + kill switches, maintenance + read-only mode, cron job status with manual trigger, rate-limit tuner, env-var overview (redacted)."
      />
    </>
  );
}
