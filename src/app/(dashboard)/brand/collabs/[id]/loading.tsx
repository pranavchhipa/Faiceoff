import { PageHeaderSkeleton, SplitSkeleton } from "@/components/ui/skeletons";

/** Skeleton for /brand/collabs/[id] — header + the studio/chat/vault split layout. */
export default function BrandCollabDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton withCta />
      <SplitSkeleton />
    </div>
  );
}
