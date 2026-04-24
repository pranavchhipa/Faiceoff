import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative border-t border-border/60 mt-32">
      <div className="mx-auto max-w-7xl px-5 py-16 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo-dark.png" alt="Faiceoff" className="h-7 w-auto mb-4" />
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
            India's AI face licensing marketplace. Built for creators. Trusted by brands.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded-md bg-secondary">DPDP Act compliant</span>
            <span className="px-2 py-1 rounded-md bg-secondary">KYC verified</span>
            <span className="px-2 py-1 rounded-md bg-secondary">Made in India 🇮🇳</span>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-4">Product</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/for-creators" className="hover:text-foreground transition-colors">
                For Creators
              </Link>
            </li>
            <li>
              <Link href="/for-brands" className="hover:text-foreground transition-colors">
                For Brands
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-4">Company</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="hover:text-foreground cursor-pointer transition-colors">Privacy</span>
            </li>
            <li>
              <span className="hover:text-foreground cursor-pointer transition-colors">Terms</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Faiceoff Technologies Pvt Ltd</span>
          <span>Bengaluru · Mumbai · Delhi</span>
        </div>
      </div>
    </footer>
  );
}
