import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function CompliancePage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Compliance" subtitle="DPDP · GST · TDS · audit trail" />
      <ComingSoon
        module="Compliance"
        description="DPDP consent log per user, data export + deletion queue (right to access / be forgotten), GST report, TDS Form 26Q prep, legal-grade audit trail."
      />
    </>
  );
}
