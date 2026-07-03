"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SPORTS = [
  { href: "/cs2", label: "CS2", enabled: true },
  { href: "/nhl", label: "NHL", enabled: false },
  { href: "/mlb", label: "MLB", enabled: false },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="font-mono text-lg font-bold tracking-widest text-accent"
        >
          CSSNIPES
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {SPORTS.map((sport) =>
            sport.enabled ? (
              <Link
                key={sport.href}
                href={sport.href}
                className={`rounded px-3 py-1.5 font-medium transition-colors ${
                  pathname.startsWith(sport.href)
                    ? "bg-surface-2 text-fg"
                    : "text-muted hover:text-fg"
                }`}
              >
                {sport.label}
              </Link>
            ) : (
              <span
                key={sport.href}
                className="cursor-default rounded px-3 py-1.5 text-muted/50"
                title="Coming soon"
              >
                {sport.label}
              </span>
            )
          )}
        </nav>
        <div className="ml-auto">
          <Link
            href="/cs2/search"
            className="rounded border border-edge px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-dim hover:text-fg"
          >
            Search…
          </Link>
        </div>
      </div>
    </header>
  );
}
