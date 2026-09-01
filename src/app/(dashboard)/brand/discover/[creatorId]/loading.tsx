import { PageHeaderSkeleton, SplitSkeleton } from "@/components/ui/skeletons";

/** Skeleton for /brand/discover/[creatorId] — creator detail. */
export default function CreatorDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <SplitSkeleton />
    </div>
  );
}
