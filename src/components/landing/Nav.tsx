"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/", label: "Home" },
  { href: "/for-creators", label: "For Creators" },
  { href: "/for-brands", label: "For Brands" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
      className="fixed top-0 inset-x-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-5 py-4">
        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/70 backdrop-blur-xl px-5 py-3 shadow-card">
          <Link href="/" className="flex items-center" aria-label="Faiceoff home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo-dark.png" alt="Faiceoff" className="h-7 md:h-8 w-auto" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === l.href
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup/creator"
              className="px-4 py-2 rounded-lg bg-gradient-primary text-primary-foreground text-sm font-semibold hover:shadow-glow transition-shadow"
            >
              Get started
            </Link>
          </div>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-secondary"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden mt-2 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl p-3 flex flex-col gap-1"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-lg text-sm font-medium hover:bg-secondary"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="px-4 py-3 rounded-lg text-sm font-medium hover:bg-secondary"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup/creator"
              onClick={() => setOpen(false)}
              className="mt-1 px-4 py-3 rounded-lg bg-gradient-primary text-primary-foreground font-semibold text-center"
            >
              Get started
            </Link>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
}
