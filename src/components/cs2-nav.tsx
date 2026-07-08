"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/cs2", label: "Overview", exact: true },
  { href: "/cs2/schedule", label: "Schedule" },
  { href: "/cs2/matches", label: "Matches" },
  { href: "/cs2/players", label: "Players" },
  { href: "/cs2/teams", label: "Teams" },
  { href: "/cs2/rankings", label: "Rankings" },
  { href: "/cs2/events", label: "Events" },
  { href: "/cs2/compare", label: "Compare" },
  { href: "/cs2/search", label: "Search" },
];

export function Cs2Nav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="CS2 sections"
      className="-mx-4 mb-8 overflow-x-auto border-b border-edge px-4 sm:-mx-6 sm:px-6"
    >
      <div className="flex gap-1 text-sm">
        {SECTIONS.map((s) => {
          const active = s.exact
            ? pathname === s.href
            : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 font-medium transition-colors ${
                active
                  ? "border-accent text-fg"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
