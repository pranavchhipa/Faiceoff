import { PageHeaderSkeleton, SplitSkeleton } from "@/components/ui/skeletons";

/** Skeleton for /brand/collabs/[id]/studio — brief form + output panel split. */
export default function BrandStudioLoading() {
  return (
    <div className="w-full py-6 lg:py-8">
      <PageHeaderSkeleton withCta />
      <SplitSkeleton />
    </div>
  );
}
