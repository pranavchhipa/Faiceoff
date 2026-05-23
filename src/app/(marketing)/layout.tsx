import type { ReactNode } from "react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { MarketingChrome } from "./MarketingChrome";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  // MarketingChrome hides the global Nav/Footer on the dark, self-contained
  // SEO pages (/creators*, /earn, /learn*, /for-brands/<industry>) which ship
  // their own header + footer — otherwise the chrome stacks (doubled logo).
  return (
    <MarketingChrome nav={<Nav />} footer={<Footer />}>
      {children}
    </MarketingChrome>
  );
}
