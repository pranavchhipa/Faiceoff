import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function DisputesPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Disputes" subtitle="Open disputes between brands and creators" />
      <ComingSoon
        module="Disputes resolution"
        description="Open disputes queue with both sides' statements, suggested resolution, refund-full / refund-partial / side-with-X actions, audit-logged."
      />
    </>
  );
}
