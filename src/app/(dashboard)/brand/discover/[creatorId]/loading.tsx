import { PageHeaderSkeleton, SplitSkeleton } from "@/components/ui/skeletons";

/** Skeleton for /brand/discover/[creatorId] — creator detail. */
export default function CreatorDetailLoading() {
  return (
    <div className="w-full py-6 sm:py-10">
      <PageHeaderSkeleton />
      <SplitSkeleton />
    </div>
  );
}
