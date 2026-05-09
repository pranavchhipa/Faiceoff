import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function PricingPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Pricing & promotions" subtitle="Packages · free credits · platform commission · promo codes" />
      <ComingSoon
        module="Pricing controls"
        description="Edit Frame / Feature / Cover prices live, free signup credits slider, platform commission slider with creator-earnings preview, promo codes."
      />
    </>
  );
}
