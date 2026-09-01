import {
  PageHeaderSkeleton,
  CardGridSkeleton,
} from "@/components/ui/skeletons";

/** Skeleton for /brand/vault — licensed-image grid. */
export default function BrandVaultLoading() {
  return (
    <div className="w-full py-6 lg:py-8">
      <PageHeaderSkeleton withCta />
      <CardGridSkeleton count={10} aspect="aspect-square" />
    </div>
  );
}
