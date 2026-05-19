import { Phone, Mail, MapPin, Clock, HeadphonesIcon } from "lucide-react";
import { COMPANY } from "@/lib/constants/company";

export const metadata = {
  title: "Contact — Faiceoff",
  description:
    "Reach Faiceoff support, sales, and the founding team. Operated by Isometrica Experiences Pvt. Ltd. from Noida, India.",
};

/**
 * Contact page — single page that surfaces every channel for reaching us.
 * Footer links here ("Contact"). Legal pages link here for "Have a question?".
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
      {/* Header */}
      <div className="max-w-2xl">
        <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Get in touch
        </span>
        <h1 className="mt-3 font-display text-[40px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] md:text-[52px]">
          We&apos;d love to hear from you.
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[var(--color-muted-foreground)]">
          Whether you&apos;re a creator getting started, a brand exploring licensed
          AI imagery, or press digging into the marketplace — pick the right
          channel below.
        </p>
      </div>

      {/* Channel cards */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {/* General inquiry */}
        <ChannelCard
          icon={<Mail className="h-5 w-5" />}
          label="General inquiries"
          primary={COMPANY.emails.hello}
          href={`mailto:${COMPANY.emails.hello}`}
          subtitle="Partnership, sales, press — anything that isn't a billing issue."
        />

        {/* Support */}
        <ChannelCard
          icon={<HeadphonesIcon className="h-5 w-5" />}
          label="Support"
          primary={COMPANY.emails.support}
          href={`mailto:${COMPANY.emails.support}`}
          subtitle="Account help, payment issues, license problems. Reply within 24h."
        />

        {/* Phone */}
        <ChannelCard
          icon={<Phone className="h-5 w-5" />}
          label="Phone"
          primary={COMPANY.phone.display}
          href={COMPANY.phone.tel}
          subtitle={COMPANY.hours}
        />

        {/* Legal */}
        <ChannelCard
          icon={<Mail className="h-5 w-5" />}
          label="Legal & DPDP"
          primary={COMPANY.emails.legal}
          href={`mailto:${COMPANY.emails.legal}`}
          subtitle="Contract questions, DPDP / data-deletion requests, IP disputes."
        />
      </div>

      {/* Founders */}
      <section className="mt-14">
        <h2 className="font-display text-[22px] font-800 tracking-tight text-[var(--color-foreground)]">
          Founders
        </h2>
        <p className="mt-2 text-[14px] text-[var(--color-muted-foreground)]">
          For founder-level conversations only — for everything else use the
          channels above so your message gets to the right person faster.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {COMPANY.founders.map((f) => (
            <a
              key={f.email}
              href={`mailto:${f.email}`}
              className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 font-display text-[15px] font-800 text-[var(--color-primary)]">
                {f.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15px] font-700 text-[var(--color-foreground)]">
                  {f.name}
                </div>
                <div className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                  {f.role} · {f.email}
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Registered office */}
      <section className="mt-14">
        <h2 className="font-display text-[22px] font-800 tracking-tight text-[var(--color-foreground)]">
          Registered office
        </h2>
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
            <address className="not-italic text-[14px] leading-relaxed text-[var(--color-foreground)]">
              <div className="font-700">{COMPANY.legalName}</div>
              <div className="mt-1 text-[var(--color-muted-foreground)]">
                {COMPANY.address.line1}
                <br />
                {COMPANY.address.line2}
                <br />
                {COMPANY.address.state}, {COMPANY.address.country}
              </div>
            </address>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-4 text-[13px] text-[var(--color-muted-foreground)]">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              <a
                href={COMPANY.phone.tel}
                className="hover:text-[var(--color-foreground)] hover:underline"
              >
                {COMPANY.phone.display}
              </a>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {COMPANY.hours}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[var(--color-muted-foreground)]">
          Faiceoff is operated by {COMPANY.legalName}.
        </p>
      </section>
    </div>
  );
}

function ChannelCard({
  icon,
  label,
  primary,
  href,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  href: string;
  subtitle: string;
}) {
  return (
    <a
      href={href}
      className="group flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition-all hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          {icon}
        </span>
        <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
      </div>
      <div className="mt-3 font-display text-[16px] font-700 tracking-tight text-[var(--color-foreground)] group-hover:text-[var(--color-primary)]">
        {primary}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {subtitle}
      </p>
    </a>
  );
}
