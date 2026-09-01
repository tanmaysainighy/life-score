"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Text navigation. A four-item product doesn't need icons to be findable, and
 * dropping them removes a row of decorative glyphs from every screen.
 *
 * Mobile keeps a bottom bar because the thumb is there; it uses the same words.
 */

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/log", label: "History" },
  { href: "/groups", label: "Groups" },
  { href: "/profile", label: "Profile" },
];

function useActive(href: string) {
  const pathname = usePathname();
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({ name }: { name: string }) {
  return (
    <nav className="hidden w-32 shrink-0 lg:block" aria-label="Main">
      <ul className="sticky top-24 flex flex-col gap-0.5">
        {LINKS.map((link) => <Item key={link.href} {...link} />)}
      </ul>
      <p className="t-meta sticky top-56 mt-8 truncate">{name}</p>
    </nav>
  );
}

function Item({ href, label }: { href: string; label: string }) {
  const active = useActive(href);
  return (
    <li>
      <Link
        href={href}
        prefetch
        aria-current={active ? "page" : undefined}
        className="tap flex min-h-9 items-center text-[0.9375rem] transition-colors"
        style={{ color: active ? "var(--ink)" : "var(--faint)" }}
      >
        {label}
      </Link>
    </li>
  );
}

export function BottomNav() {
  return (
    <nav
      className="rule-t fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{
        background: "color-mix(in srgb, var(--bg) 92%, transparent)",
        backdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-lg">
        {LINKS.map((link) => <BottomItem key={link.href} {...link} />)}
      </ul>
    </nav>
  );
}

function BottomItem({ href, label }: { href: string; label: string }) {
  const active = useActive(href);
  return (
    <li className="flex-1">
      <Link
        href={href}
        prefetch
        aria-current={active ? "page" : undefined}
        className="tap relative flex min-h-14 items-center justify-center text-[0.8125rem] transition-colors"
        style={{ color: active ? "var(--ink)" : "var(--faint)" }}
      >
        {/* Marks the active tab with position as well as colour. */}
        <span
          aria-hidden
          className="absolute inset-x-5 top-0 h-px transition-opacity"
          style={{ background: "var(--ink)", opacity: active ? 1 : 0 }}
        />
        {label}
      </Link>
    </li>
  );
}
