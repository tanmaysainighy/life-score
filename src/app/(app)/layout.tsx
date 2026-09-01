import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signOut } from "../login/actions";
import { Sidebar, BottomNav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The shell renders from the session lookup alone — one indexed query — so the
 * frame is on screen before any page data is gathered.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh">
      <header className="rule-b sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-5 sm:px-8">
          <Link href="/" className="tap -ml-1 flex min-h-11 items-center px-1" aria-label="LifeScore home">
            <span className="t-figure text-[0.9375rem] tracking-[-0.02em]">LifeScore</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <form action={signOut}>
              <button type="submit" className="hit btn btn-bare btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-12 px-5 pb-28 pt-10 sm:px-8 lg:pb-16">
        <Sidebar name={user.name} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
