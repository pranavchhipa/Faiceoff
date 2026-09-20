"use client";

/**
 * Tiny client island: a scrollable text block with a copy button.
 * Used for the assembled prompt and the raw JSON blobs on the generation
 * detail page — the only interactivity on an otherwise server-rendered page.
 */

import { useState } from "react";

export function CopyBlock({
  text,
  label,
  maxHeight = 320,
}: {
  text: string;
  label?: string;
  maxHeight?: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (insecure context / permissions). The text is
      // selectable anyway, so fail quietly rather than throwing in the UI.
      setCopied(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        {label ? (
          <span className="cc-card-title" style={{ margin: 0 }}>
            {label}
          </span>
        ) : (
          <span />
        )}
        <button type="button" onClick={copy} className="cc-btn" style={{ padding: "3px 10px", fontSize: 11 }}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "10px 12px",
          background: "var(--cc-bg)",
          border: "1px solid var(--cc-border)",
          borderRadius: 4,
          color: "var(--cc-fg)",
          fontFamily: "var(--cc-mono)",
          fontSize: 11.5,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight,
          overflow: "auto",
        }}
      >
        {text}
      </pre>
    </div>
  );
}
