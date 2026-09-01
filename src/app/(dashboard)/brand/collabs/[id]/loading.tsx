import { PageHeaderSkeleton, SplitSkeleton } from "@/components/ui/skeletons";

/** Skeleton for /brand/collabs/[id] — header + the studio/chat/vault split layout. */
export default function BrandCollabDetailLoading() {
  return (
    <div className="w-full py-6 lg:py-8">
      <PageHeaderSkeleton withCta />
      <SplitSkeleton />
    </div>
  );
}
