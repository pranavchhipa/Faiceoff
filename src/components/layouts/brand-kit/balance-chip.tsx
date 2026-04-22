"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Props {
  paise: number;
  label?: string;
  ariaLabel?: string;
}

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Animated rupee counter chip. On mount or value change it tweens from the
 * previous value to `paise` over 800ms (respects prefers-reduced-motion).
 */
export function BalanceChip({ paise, label, ariaLabel }: Props) {
  const reduceMotion = useReducedMotion();
  const prev = useRef(paise);
  const [displayed, setDisplayed] = useState(paise);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayed(paise);
      prev.current = paise;
      return;
    }
    const start = prev.current;
    const delta = paise - start;
    if (delta === 0) return;
    const duration = 800;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // easeOutExpo
      setDisplayed(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = paise;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paise, reduceMotion]);

  const formatted = formatRupees(displayed);
  const a11y = ariaLabel ? `${ariaLabel}: ₹${formatted}` : `₹${formatted}`;

  return (
    <motion.span
      role="status"
      aria-label={a11y}
      aria-live="polite"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--role-accent-strong)]/30 bg-[var(--role-accent)]/40 px-3 py-1 text-sm font-semibold text-[var(--color-ink)]"
    >
      {label ? <span className="text-xs opacity-70">{label}</span> : null}
      <span className="font-mono tabular-nums">₹{formatted}</span>
    </motion.span>
  );
}
