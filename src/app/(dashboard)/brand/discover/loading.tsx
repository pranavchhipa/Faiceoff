import {
  PageHeaderSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /brand/discover — creator marketplace grid. */
export default function BrandDiscoverLoading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton withCta />
      <CardGridSkeleton count={8} aspect="aspect-[3/4]" />
    </div>
  );
}
