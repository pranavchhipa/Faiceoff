import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { MarketingHeader } from "./MarketingHeader";

const navLinks = [
  { label: "For Creators", href: "/for-creators" },
  { label: "For Brands", href: "/for-brands" },
];

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface font-body selection:bg-primary-container selection:text-on-primary-container">
      {/* ── Navigation ── */}
      <MarketingHeader />

      {/* ── Main content ── */}
      <main className="flex-1 w-full overflow-x-hidden">{children}</main>

      {/* ── Footer ── */}
      <footer className="w-full border-t border-outline-variant/15 bg-surface-container-low mt-auto">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-12 max-w-7xl mx-auto gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Image src="/images/logo-dark.png" alt="Faiceoff" width={120} height={40} className="h-6 w-auto" />
            <p className="font-body text-sm text-on-surface-variant m-0">© {new Date().getFullYear()} Faiceoff. DPDP Compliant. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <Link href="/privacy" className="font-body text-sm text-on-surface-variant hover:text-primary transition-colors no-underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="font-body text-sm text-on-surface-variant hover:text-primary transition-colors no-underline">
              Terms of Service
            </Link>
            <Link href="/contact" className="font-body text-sm text-on-surface-variant hover:text-primary transition-colors no-underline">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
