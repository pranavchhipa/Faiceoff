import { PageHeaderSkeleton, SplitSkeleton } from "@/components/ui/skeletons";

/** Skeleton for /creator/collabs/[id] — collab workspace. */
export default function CreatorCollabLoading() {
  return (
    <div className="w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <SplitSkeleton />
    </div>
  );
}
