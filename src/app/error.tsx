"use client";

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-3xl" aria-hidden>🌧️</span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        That's on us, not you. Nothing you logged has been lost — try again in a moment.
      </p>
      <button onClick={reset} className="btn btn-primary mt-2">Try again</button>
    </main>
  );
}
