import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * Compact dark footer for the self-contained SEO pages that don't bake in
 * their own (the /creators directory + the category landings). Matches the
 * ArticleShell / profile footer so the dark SEO cluster reads as one product.
 *
 * The global cream <Footer> is intentionally hidden on these routes (see
 * MarketingChrome), so each dark page needs a footer of its own.
 */
export function MarketingDarkFooter() {
  return (
    <footer className="border-t border-[#2a2520] px-4 py-7 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <Link href="/" className="inline-flex items-center gap-2 opacity-80 hover:opacity-100">
          <Logo variant="mark" className="h-12 w-12" />
          <span className="font-mono text-[9px] font-700 uppercase tracking-[0.2em] text-[#a89570]">
            Powered by Faiceoff
          </span>
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-[9.5px] font-700 uppercase tracking-[0.2em] text-[#6e6457]">
          <Link href="/creators" className="hover:text-[#f5ebd6]">Creators</Link>
          <Link href="/for-brands" className="hover:text-[#f5ebd6]">For Brands</Link>
          <Link href="/for-creators" className="hover:text-[#f5ebd6]">For Creators</Link>
          <Link href="/learn" className="hover:text-[#f5ebd6]">Learn</Link>
          <Link href="/pricing" className="hover:text-[#f5ebd6]">Pricing</Link>
        </div>
      </div>
    </footer>
  );
}
