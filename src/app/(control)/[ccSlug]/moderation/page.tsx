import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function ModerationPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Moderation" subtitle="Hive scores · creator-flagged · compliance violations" />
      <ComingSoon
        module="Content moderation"
        description="Generation queue with Hive safety scores, manual review queue, force-discard with refund, watermark inspector."
      />
    </>
  );
}
