import { PageHeaderSkeleton, SplitSkeleton } from "@/components/ui/skeletons";

/** Skeleton for /creator/collabs/[id] — collab workspace. */
export default function CreatorCollabLoading() {
  return (
    <div className="w-full py-6 lg:py-8">
      <PageHeaderSkeleton />
      <SplitSkeleton />
    </div>
  );
}
