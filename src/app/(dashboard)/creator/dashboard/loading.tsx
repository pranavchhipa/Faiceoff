import {
  PageHeaderSkeleton,
  StatStripSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /creator/dashboard — header + earnings stats + approvals grid. */
export default function CreatorDashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton withCta />
      <StatStripSkeleton count={4} />
      <CardGridSkeleton count={6} aspect="aspect-square" />
    </div>
  );
}
