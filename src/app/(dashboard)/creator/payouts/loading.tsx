import {
  PageHeaderSkeleton,
  StatStripSkeleton,
  SplitSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /creator/payouts — earnings + payout history. */
export default function CreatorPayoutsLoading() {
  return (
    <div className="w-full pt-6 lg:pt-8">
      <PageHeaderSkeleton />
      <StatStripSkeleton count={4} />
      <SplitSkeleton />
    </div>
  );
}
