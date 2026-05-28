import {
  PageHeaderSkeleton,
  StatStripSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/**
 * Loading skeleton for /brand/dashboard — paints the page shape (header,
 * stats strip, recent collabs grid) while the server fetches the live data.
 * Replaces the blank stretch + root spinner pattern on first paint.
 */
export default function BrandDashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton withCta />
      <StatStripSkeleton count={4} />
      <CardGridSkeleton count={6} aspect="aspect-[16/10]" />
    </div>
  );
}
