import {
  PageHeaderSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /creator/approvals — approval queue cards. */
export default function CreatorApprovalsLoading() {
  return (
    <div className="w-full py-6 lg:py-8">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} aspect="aspect-[4/5]" />
    </div>
  );
}
