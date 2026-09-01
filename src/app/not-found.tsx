import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-3xl" aria-hidden>🧭</span>
      <h1 className="text-lg font-semibold">Nothing here</h1>
      <p className="text-sm text-muted">That page doesn't exist, or you don't have access to it.</p>
      <Link href="/" className="btn btn-primary mt-2">Back to your dashboard</Link>
    </main>
  );
}
