import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function HealthPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Marketplace health" subtitle="Funnel · cohorts · top movers" />
      <ComingSoon
        module="Marketplace health"
        description="Top creators / brands by spend + approval rate, signup → first request → first approval funnel with drop-off, cohort retention, geo + category mix."
      />
    </>
  );
}
