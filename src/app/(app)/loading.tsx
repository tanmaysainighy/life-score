/**
 * The shell is already painted by the layout; this stands in for page content
 * only. It mirrors the real hierarchy — a big figure, an input rule, a few rows
 * — so nothing jumps when the data lands.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="h-4 w-40 rounded" style={{ background: "var(--sunken)" }} />
      <div className="mt-6 h-16 w-52 rounded" style={{ background: "var(--sunken)" }} />
      <div className="mt-4 h-3 w-64 rounded" style={{ background: "var(--sunken)" }} />

      <div className="mt-14 h-3 w-32 rounded" style={{ background: "var(--sunken)" }} />
      <div className="rule-b mt-4 h-9" />

      <div className="mt-16 h-3 w-20 rounded" style={{ background: "var(--sunken)" }} />
      <div className="mt-5 flex flex-col gap-5">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-4">
            <div className="h-3 w-10 rounded" style={{ background: "var(--sunken)" }} />
            <div className="h-3 flex-1 rounded" style={{ background: "var(--sunken)" }} />
            <div className="h-3 w-10 rounded" style={{ background: "var(--sunken)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
