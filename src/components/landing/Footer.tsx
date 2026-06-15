// Marketing footer — light editorial.
// Server component. Uses .landing-scope vars so it inherits the cream palette.
//
// Structure:
//   ┌─────────────────────────────────────────────────────────────┐
//   │  brand block  │  Product  │  Company  │  Legal              │
//   │  (logo +      │  links    │  links    │  links               │
//   │   tagline +   │           │           │                      │
//   │   socials)    │           │           │                      │
//   ├─────────────────────────────────────────────────────────────┤
//   │  © · Made in India · DPDP / GST / IT Act compliance pills    │
//   └─────────────────────────────────────────────────────────────┘

import type { SVGProps } from "react";
import Link from "next/link";
import { COMPANY } from "@/lib/constants/company";
import { Logo } from "@/components/brand/logo";

/* ─────────────────────────────────────────────────────────────────────────────
   Inline social-icon SVGs.
   lucide-react in this project doesn't export brand glyphs (Instagram /
   Linkedin / Twitter), so we render minimal monoline paths inline. They share
   the lucide stroke style: 1.6 weight, round caps, 24×24 box. Color via
   currentColor so they pick up the wrapping anchor's text color.
   ───────────────────────────────────────────────────────────────────────── */

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function TwitterX(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_PROPS} {...props} aria-hidden>
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}

function InstagramGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_PROPS} {...props} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedinGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...ICON_PROPS} {...props} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 1 1 4 0v4M12 13v4" />
    </svg>
  );
}

const PRODUCT_LINKS = [
  { href: "/for-brands", label: "For Brands" },
  { href: "/for-creators", label: "For Creators" },
  { href: "/pricing", label: "Pricing" },
  { href: "/verify", label: "Verify Licence" },
] as const;

// SEO surfaces — sitewide internal links to the creator directory + the
// highest-intent category landings. Footer links appear on every page, so
// these give the programmatic SEO pages strong, consistent link equity.
const BROWSE_LINKS = [
  { href: "/creators", label: "All Creators" },
  { href: "/creators/category/fashion", label: "Fashion" },
  { href: "/creators/category/beauty", label: "Beauty" },
  { href: "/creators/category/tech", label: "Tech" },
  { href: "/creators/category/travel", label: "Travel" },
  { href: "/creators/category/fitness", label: "Fitness" },
] as const;

// Resources — all real pages. Removed dead About/Blog/Careers '#' links
// (bad for SEO + UX). Re-add only when those pages actually exist.
const RESOURCE_LINKS = [
  { href: "/learn", label: "Learn" },
  { href: "/earn", label: "Earn" },
  { href: "/contact", label: "Contact" },
] as const;

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund", label: "Refund" },
  { href: "/creator-agreement", label: "Creator Agreement" },
] as const;

const COMPLIANCE_PILLS = ["DPDP Act", "GST", "IT Act"] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="relative mt-24 md:mt-32"
      style={{
        background: "var(--lp-paper-2)",
        borderTop: "1px solid var(--lp-border)",
      }}
    >
      <div className="lp-container py-16 md:py-20">
        <div className="grid gap-12 md:gap-10 md:grid-cols-12">
          {/* ── Brand block ───────────────────────────────────── */}
          <div className="md:col-span-4">
            <Link
              href="/"
              aria-label="Faiceoff home"
              className="inline-flex items-center"
            >
              <Logo variant="full" tone="dark" className="h-9 w-auto" />
            </Link>

            <p
              className="mt-5 max-w-sm text-[14.5px] leading-relaxed"
              style={{ color: "var(--lp-muted)" }}
            >
              Faiceoff is India&rsquo;s AI face licensing marketplace
              &mdash; built for creators, trusted by brands.
            </p>

            {/* Contact block — address + phone + email */}
            <address
              className="not-italic mt-6 space-y-1.5 text-[13px] leading-relaxed"
              style={{ color: "var(--lp-muted)" }}
            >
              <div style={{ color: "var(--lp-ink-soft)", fontWeight: 600 }}>
                {COMPANY.legalName}
              </div>
              <div>{COMPANY.address.inline}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <a
                  href={`mailto:${COMPANY.emails.hello}`}
                  className="hover:underline"
                  style={{ color: "var(--lp-ink-soft)", textUnderlineOffset: 3 }}
                >
                  {COMPANY.emails.hello}
                </a>
              </div>
              <div className="text-[12px]" style={{ opacity: 0.8 }}>
                {COMPANY.hours}
              </div>
            </address>

            {/* socials — only render handles that are actually configured,
                so we never ship dead '#' links (bad for SEO + UX) */}
            {(COMPANY.socials.instagram ||
              COMPANY.socials.twitter ||
              COMPANY.socials.linkedin) && (
              <div className="mt-6 flex items-center gap-2">
                {[
                  { Icon: TwitterX, label: "X / Twitter", href: COMPANY.socials.twitter },
                  { Icon: InstagramGlyph, label: "Instagram", href: COMPANY.socials.instagram },
                  { Icon: LinkedinGlyph, label: "LinkedIn", href: COMPANY.socials.linkedin },
                ]
                  .filter((s) => Boolean(s.href))
                  .map(({ Icon, label, href }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={label}
                      className="h-9 w-9 rounded-full flex items-center justify-center transition-colors hover:opacity-80"
                      style={{
                        background: "var(--lp-paper)",
                        border: "1px solid var(--lp-border)",
                        color: "var(--lp-ink-soft)",
                      }}
                    >
                      <Icon />
                    </a>
                  ))}
              </div>
            )}
          </div>

          {/* ── Browse (SEO surfaces) ─────────────────────────── */}
          <FooterColumn heading="Browse" links={BROWSE_LINKS} />

          {/* ── Product ───────────────────────────────────────── */}
          <FooterColumn heading="Product" links={PRODUCT_LINKS} />

          {/* ── Resources ─────────────────────────────────────── */}
          <FooterColumn heading="Resources" links={RESOURCE_LINKS} />

          {/* ── Legal ─────────────────────────────────────────── */}
          <FooterColumn heading="Legal" links={LEGAL_LINKS} />
        </div>
      </div>

      {/* ── Bottom bar ──────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--lp-border)" }}>
        <div
          className="lp-container py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--lp-muted)",
            letterSpacing: "0.04em",
          }}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>&copy; {year} {COMPANY.legalName}</span>
            <span aria-hidden>&middot;</span>
            <span>
              Made in India{" "}
              <span aria-hidden role="img">{"🇮🇳"}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {COMPLIANCE_PILLS.map((label) => (
              <span
                key={label}
                className="px-2.5 py-1 rounded-full"
                style={{
                  background: "var(--lp-paper)",
                  border: "1px solid var(--lp-border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "var(--lp-ink-soft)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div className="md:col-span-2">
      <h4
        className="mb-4"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--lp-ink)",
        }}
      >
        {heading}
      </h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={`${heading}-${l.label}`}>
            <Link
              href={l.href}
              className="text-[14px] transition-colors hover:underline"
              style={{
                color: "var(--lp-ink-soft)",
                textUnderlineOffset: 4,
              }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
