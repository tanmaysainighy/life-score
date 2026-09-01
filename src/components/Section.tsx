import type { ReactNode } from "react";

/**
 * A section is a label, a hairline, and content — not a box.
 *
 * This is the only structural wrapper in the app. Everything that used to be a
 * bordered card is now a section separated by space and a single rule, which is
 * what lets the layout hold up with every shadow removed.
 */
export function Section({
  title, meta, action, children,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="rule-b flex items-baseline justify-between gap-4 pb-2.5">
        <h2 className="t-section">{title}</h2>
        <div className="flex items-baseline gap-4">
          {meta && <span className="t-meta">{meta}</span>}
          {action}
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

/**
 * The empty dashboard. A blank day is the most common first impression, so it
 * teaches the one thing worth knowing — how to phrase an entry — using real
 * examples rather than telling the user there is no data.
 */
export function FirstRun({ returning }: { returning: boolean }) {
  if (returning) {
    return (
      <div className="rule-t pt-8">
        <p className="t-heading">Nothing logged today.</p>
        <p className="t-secondary mt-2 max-w-sm text-[0.9375rem]">
          Whatever you&rsquo;ve been doing, say it above in your own words.
        </p>
      </div>
    );
  }

  return (
    <div className="rule-t pt-8">
      <p className="t-heading">Your day starts here.</p>
      <p className="t-secondary mt-2 max-w-sm text-[0.9375rem]">
        Tell it what you did. It works out what the activity is and what it&rsquo;s worth —
        the same rules for everyone.
      </p>

      <ul className="mt-6 flex flex-col gap-1.5">
        {[
          "Studied Python for 2 hours",
          "Ran 5 km",
          "Built my portfolio site this evening",
          "Read 30 pages",
        ].map((example) => (
          <li key={example} className="t-secondary text-sm">
            <span className="t-meta mr-2">&ldquo;</span>{example}<span className="t-meta ml-0.5">&rdquo;</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
