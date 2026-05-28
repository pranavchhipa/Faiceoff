import {
  PageHeaderSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /creator/approvals — approval queue cards. */
export default function CreatorApprovalsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} aspect="aspect-[4/5]" />
    </div>
  );
}
