import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function AIPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="AI pipeline" subtitle="Models · thresholds · prompts · cost" />
      <ComingSoon
        module="AI pipeline control"
        description="Live model selector (Gemini variant), prompt-assembler swap, compliance + Hive thresholds, stage-2 refinement toggle, cost dashboard, fixture runner."
      />
    </>
  );
}
