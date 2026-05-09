import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function MoneyPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Money" subtitle="Holdings · escrow · revenue · refunds · payouts" />
      <ComingSoon
        module="Money centre"
        description="Brand wallet aggregate · escrow ledger · today/MTD/YTD revenue · GST + TDS · RazorpayX payout queue · manual refund tool. Hooks into existing /api/admin/payouts + the new escrow_ledger view."
      />
    </>
  );
}
