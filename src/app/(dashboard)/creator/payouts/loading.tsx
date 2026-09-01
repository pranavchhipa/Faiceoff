import {
  PageHeaderSkeleton,
  StatStripSkeleton,
  SplitSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /creator/payouts — earnings + payout history. */
export default function CreatorPayoutsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <StatStripSkeleton count={4} />
      <SplitSkeleton />
    </div>
  );
}
