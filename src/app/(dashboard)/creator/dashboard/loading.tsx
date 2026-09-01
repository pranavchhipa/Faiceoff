import {
  PageHeaderSkeleton,
  StatStripSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /creator/dashboard — header + earnings stats + approvals grid. */
export default function CreatorDashboardLoading() {
  return (
    <div className="w-full pt-4 pb-10 lg:pt-5 lg:pb-12">
      <PageHeaderSkeleton withCta />
      <StatStripSkeleton count={4} />
      <CardGridSkeleton count={6} aspect="aspect-square" />
    </div>
  );
}
