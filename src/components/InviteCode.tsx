"use client";

import { useState } from "react";

/** The code, and a way to copy it. Nothing else needed. */
export function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the code is on screen to type manually.
    }
  }

  return (
    <div className="flex items-baseline justify-between gap-4">
      <p className="t-figure text-xl tracking-[0.2em]">{code}</p>
      <button onClick={copy} className="hit btn btn-bare btn-sm" aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
