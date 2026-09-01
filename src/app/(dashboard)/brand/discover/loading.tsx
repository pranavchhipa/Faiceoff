import {
  PageHeaderSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /brand/discover — creator marketplace grid. */
export default function BrandDiscoverLoading() {
  return (
    <div className="w-full pt-4 pb-10 lg:pt-5 lg:pb-12">
      <PageHeaderSkeleton withCta />
      <CardGridSkeleton count={10} aspect="aspect-[3/4]" />
    </div>
  );
}
