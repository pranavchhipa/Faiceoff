"use client";

/**
 * Shared dashboard stat/data-viz primitives — used by both the brand and
 * creator dashboards so the two sides stay visually identical. All colour
 * comes from CSS variables / currentColor so everything is dark-theme native.
 * Charts are hand-built SVG (no chart library) for full control + zero deps.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp } from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export function MetricCard({
  children,
  delay = 0,
  lead,
}: {
  children: ReactNode;
  delay?: number;
  lead?: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as const }}
      className={`rounded-2xl border p-4 lg:p-5 ${
        lead
          ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/[0.06]"
          : "border-[var(--color-border)] bg-[var(--color-card)]"
      }`}
    >
      {children}
    </motion.div>
  );
}

export function MetricHead({
  icon,
  trend,
  lead,
}: {
  icon: ReactNode;
  trend?: string;
  lead?: boolean;
}) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          lead
            ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
            : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
        }`}
      >
        {icon}
      </div>
      {trend && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/12 px-2 py-1 font-display text-[11px] font-700 text-[var(--color-primary)]">
          <TrendingUp className="h-3 w-3" /> {trend}
        </span>
      )}
    </div>
  );
}

export function MetricValue({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-[26px] font-800 leading-none tracking-tight text-[var(--color-foreground)] lg:text-[28px]">
      {children}
    </p>
  );
}

export function MetricLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-[12.5px] text-[var(--color-muted-foreground)]">
      {children}
    </p>
  );
}

export function QuickAction({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3 transition-all hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-[var(--color-foreground)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-700 text-[13px] text-[var(--color-foreground)]">
          {title}
        </p>
        <p className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/* ── Segments shared by BreakdownBar + ApprovalRing legend ── */
export interface Segment {
  label: string;
  value: number;
  colorClass: string;
}

export function BreakdownBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="mt-3.5 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
      {segments.map((seg) => (
        <span
          key={seg.label}
          className={seg.colorClass}
          style={{ width: `${(seg.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function Sparkline({
  data,
  className = "",
}: {
  data: number[];
  className?: string;
}) {
  const W = 200;
  const H = 30;
  const pad = 3;
  if (!data || data.length < 2) return <div className="h-[30px]" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) =>
    pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
  let d = `M${x(0)} ${y(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const xc = (x(i - 1) + x(i)) / 2;
    d += ` C${xc} ${y(data[i - 1])} ${xc} ${y(data[i])} ${x(i)} ${y(data[i])}`;
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`block h-[30px] w-full ${className}`}
    >
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="currentColor" opacity={0.13} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.6} fill="currentColor" />
    </svg>
  );
}

export function AreaChart({ data }: { data: number[] }) {
  const W = 720;
  const H = 230;
  const L = 30;
  const R = 10;
  const T = 14;
  const B = 24;
  const max = Math.max(...data, 1);
  const x = (i: number) => L + (i / (data.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  let line = `M${x(0)} ${y(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const xc = (x(i - 1) + x(i)) / 2;
    line += ` C${xc} ${y(data[i - 1])} ${xc} ${y(data[i])} ${x(i)} ${y(data[i])}`;
  }
  const area = `${line} L${x(data.length - 1)} ${H - B} L${x(0)} ${H - B} Z`;
  const peak = data.length - 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="mt-4 block w-full overflow-visible text-[var(--color-primary)]"
    >
      {[0, max / 2, max].map((g, i) => (
        <line
          key={i}
          x1={L}
          y1={y(g)}
          x2={W - R}
          y2={y(g)}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
      ))}
      <path d={area} fill="currentColor" opacity={0.14} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(v)}
          r={i === peak ? 4.5 : 2.6}
          fill={i === peak ? "currentColor" : "var(--color-card)"}
          stroke="currentColor"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

export function ApprovalRing({
  rate,
  centerLabel = "Approved",
  legend,
}: {
  rate: number;
  centerLabel?: string;
  legend: Segment[];
}) {
  const r = 56;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.max(0, Math.min(100, rate)) / 100);
  return (
    <div className="mt-4 flex flex-col items-center">
      <div className="relative h-[136px] w-[136px]">
        <svg width="136" height="136" viewBox="0 0 136 136">
          <circle
            cx="68"
            cy="68"
            r={r}
            fill="none"
            className="text-[var(--color-foreground)]"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={12}
          />
          <circle
            cx="68"
            cy="68"
            r={r}
            fill="none"
            className="text-[var(--color-primary)]"
            stroke="currentColor"
            strokeWidth={12}
            strokeLinecap="round"
            transform="rotate(-90 68 68)"
            strokeDasharray={C}
            strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.3,.9,.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <b className="font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            {rate}%
          </b>
          <small className="mt-1 text-[10.5px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            {centerLabel}
          </small>
        </div>
      </div>
      <div className="mt-5 w-full space-y-2.5">
        {legend.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2.5 text-[13px]">
            <span className={`h-2.5 w-2.5 rounded-[3px] ${seg.colorClass}`} />
            <span className="text-[var(--color-muted-foreground)]">{seg.label}</span>
            <b className="ml-auto font-display font-700 text-[var(--color-foreground)]">
              {seg.value}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}
