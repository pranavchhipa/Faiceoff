"use client";

import { useState } from "react";
import type { PillOption } from "@/config/campaign-options";

interface PillSectionProps {
  icon: string;
  label: string;
  options: readonly PillOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  allowCustom?: boolean;
  optional?: boolean;
}

export function PillSection({
  icon,
  label,
  options,
  value,
  onChange,
  allowCustom = true,
  optional = false,
}: PillSectionProps) {
  const isCustom = typeof value === "string" && value.startsWith("custom:");
  const [customText, setCustomText] = useState(
    isCustom ? value!.slice("custom:".length) : ""
  );

  function selectPreset(key: string) {
    onChange(value === key ? null : key);
  }

  function toggleCustom() {
    if (isCustom) {
      onChange(null);
      setCustomText("");
    } else {
      onChange("custom:");
    }
  }

  function onCustomInput(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.slice(0, 80);
    setCustomText(next);
    onChange(next ? `custom:${next}` : "custom:");
  }

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
        <span className="flex size-5 items-center justify-center rounded-md bg-[var(--color-blush)] text-[11px]">
          {icon}
        </span>
        {label}
        {optional && (
          <span className="text-[10px] font-500 normal-case tracking-normal text-[var(--color-neutral-400)]">
            • Optional
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => selectPreset(o.key)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] font-600 text-white"
                  : "border-[var(--color-neutral-100)] bg-white text-[var(--color-neutral-600)] hover:border-[var(--color-gold)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
        {allowCustom && (
          <button
            type="button"
            onClick={toggleCustom}
            className={`rounded-full border px-3 py-1.5 text-xs font-600 transition-colors ${
              isCustom
                ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-white"
                : "border-dashed border-[var(--color-gold)] bg-white text-[var(--color-gold)]"
            }`}
          >
            + Custom
          </button>
        )}
      </div>
      {isCustom && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={customText}
            onChange={onCustomInput}
            maxLength={80}
            placeholder="Type your own…"
            className="flex-1 rounded-lg border border-[var(--color-gold)] bg-[#fdf6e7] px-3 py-2 text-sm text-[var(--color-ink)]"
            autoFocus
          />
          <span className="text-[11px] text-[var(--color-neutral-400)]">
            {customText.length} / 80
          </span>
        </div>
      )}
    </div>
  );
}
