"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navLinks = [
  { label: "For Creators", href: "/for-creators" },
  { label: "For Brands", href: "/for-brands" },
];

export function MarketingHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl shadow-[0px_24px_48px_rgba(44,47,48,0.06)] border-b border-outline-variant/10">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="no-underline">
          <Image src="/images/logo-dark.png" alt="Faiceoff" width={130} height={43} priority className="h-7 w-auto" />
        </Link>

        {/* Nav links — hidden on mobile */}
        <ul className="hidden items-center gap-8 md:flex m-0 p-0 list-none h-full">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href} className="h-full flex items-center">
                <Link
                  href={link.href}
                  className={`transition-all duration-300 font-headline font-medium tracking-tight hover:-translate-y-0.5 inline-block no-underline ${
                    isActive 
                      ? "text-primary font-bold border-b-[3px] border-primary pt-[3px]" 
                      : "text-on-surface-variant hover:text-primary border-b-[3px] border-transparent pt-[3px]"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Auth actions */}
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-on-surface-variant hover:text-primary transition-all duration-300 font-headline font-medium tracking-tight hidden sm:block no-underline"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-2.5 rounded-xl font-headline font-medium hover:-translate-y-0.5 active:scale-95 transition-all duration-300 shadow-lg shadow-[rgba(106,28,246,0.2)] no-underline"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
