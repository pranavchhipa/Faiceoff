import {
  PageHeaderSkeleton,
  StatStripSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /brand/credits — balance + pack grid. */
export default function BrandCreditsLoading() {
  return (
    <div className="w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <StatStripSkeleton count={3} />
      <CardGridSkeleton count={3} aspect="aspect-[4/3]" />
    </div>
  );
}
