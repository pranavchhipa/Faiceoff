import type { ReactNode } from "react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing-scope relative min-h-screen overflow-hidden">
      <Nav />
      <main className="flex-1 w-full overflow-x-hidden">{children}</main>
      <Footer />
    </div>
  );
}
