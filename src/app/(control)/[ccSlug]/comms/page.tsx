import { ensureCCAuth, PageHeader, ComingSoon } from "../_components/page-shell";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

export default async function CommsPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);
  return (
    <>
      <PageHeader title="Communications" subtitle="Email log · transactional templates · broadcasts" />
      <ComingSoon
        module="Communications"
        description="Resend send log + bounces + opens, transactional template editor with live preview, broadcast announcements with segment targeting + confirm modal."
      />
    </>
  );
}
