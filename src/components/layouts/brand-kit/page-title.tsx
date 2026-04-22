"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function PageTitle({ children, subtitle, action }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
          {children}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--color-ink)]/60">{subtitle}</p>
        ) : null}
      </motion.div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
