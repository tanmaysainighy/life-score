import type { ReactNode } from "react";

/**
 * Sign-in and sign-up.
 *
 * The left side is the whole pitch in four lines — the brief is that someone
 * should understand the product in seconds, and a paragraph of marketing copy
 * would take longer than the loop it describes.
 */
export function AuthShell({
  title, subtitle, children,
}: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-16 px-6 py-16 lg:flex-row lg:items-center lg:gap-24">
      <div className="max-w-sm">
        <p className="t-figure text-[0.9375rem] tracking-[-0.02em]">LifeScore</p>

        <h1 className="t-heading mt-10 text-[1.75rem] leading-[1.25] sm:text-[2rem]">
          Tell it what you did.
        </h1>

        <div className="t-secondary mt-5 flex flex-col gap-1 text-[1.0625rem] leading-relaxed">
          <p>It works out what that was.</p>
          <p>It scores it — same rules for everyone.</p>
          <p>You compete with yourself, and your friends.</p>
        </div>

        <p className="t-meta mt-8">That&rsquo;s it.</p>
      </div>

      <div className="w-full max-w-xs">
        <h2 className="t-section">{title}</h2>
        <p className="t-secondary mb-8 mt-2 text-sm">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}
