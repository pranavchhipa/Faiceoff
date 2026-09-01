import {
  PageHeaderSkeleton,
  StatStripSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /brand/credits — balance + pack grid. */
export default function BrandCreditsLoading() {
  return (
    <div className="w-full pt-5 pb-12">
      <PageHeaderSkeleton />
      <StatStripSkeleton count={3} />
      <CardGridSkeleton count={5} aspect="aspect-[4/3]" />
    </div>
  );
}
