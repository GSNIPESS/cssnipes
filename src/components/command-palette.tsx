"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Global command palette: ⌘K / Ctrl+K / "/" opens it anywhere. Commands are
 * fuzzy-matched locally; players, teams and events come from the search API
 * (debounced). Recently viewed pages persist in localStorage.
 */

interface Item {
  key: string;
  group: "Commands" | "Recent" | "Players" | "Teams" | "Events";
  label: string;
  hint?: string;
  href: string;
}

const COMMANDS: Array<{ label: string; href: string; hint?: string }> = [
  { label: "Open CS2 overview", href: "/cs2" },
  { label: "7-day schedule", href: "/cs2/schedule" },
  { label: "Today's matches", href: "/cs2/matches?tab=upcoming" },
  { label: "Live matches", href: "/cs2/matches?tab=live" },
  { label: "Rankings", href: "/cs2/rankings" },
  { label: "Compare teams", href: "/cs2/compare?type=teams" },
  { label: "Compare players", href: "/cs2/compare?type=players" },
  { label: "Players", href: "/cs2/players" },
  { label: "Teams", href: "/cs2/teams" },
  { label: "Events", href: "/cs2/events" },
  { label: "Full search page", href: "/cs2/search" },
  {
    label: "Historical snapshot (time machine)",
    href: "/cs2/rankings",
    hint: "pick a date on the rankings page",
  },
];

const RECENT_KEY = "cssnipes.recent";

/** Subsequence fuzzy match; lower score = better, null = no match. */
function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let score = 0;
  let last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += last >= 0 ? ti - last - 1 : ti;
      last = ti;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}

function readRecent(): Array<{ label: string; href: string }> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Item[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Track visited detail pages for the "Recent" group.
  useEffect(() => {
    if (!/^\/cs2\/(players|teams|events|matches)\/[^/]+/.test(pathname)) return;
    const timer = setTimeout(() => {
      const label = document.title.replace(/ · CSSNIPES$/, "");
      const next = [
        { label, href: pathname },
        ...readRecent().filter((r) => r.href !== pathname),
      ].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    }, 300);
    return () => clearTimeout(timer);
  }, [pathname]);

  const openPalette = useCallback(() => {
    setQuery("");
    setRemote([]);
    setSelected(0);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) setTimeout(() => inputRef.current?.focus(), 0);
          return !o;
        });
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        openPalette();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("cssnipes:open-palette", openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cssnipes:open-palette", openPalette);
    };
  }, [openPalette]);

  // Debounced entity search (all state updates happen asynchronously).
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    const q = query.trim();
    debounceRef.current = setTimeout(
      async () => {
        if (q.length < 2) {
          setRemote([]);
          return;
        }
        try {
        const res = await fetch(`/api/v1/cs2/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const { data } = await res.json();
        const items: Item[] = [
          ...data.players.slice(0, 5).map((p: { slug: string; nickname: string; rosters?: Array<{ team: { name: string } }> }) => ({
            key: `p:${p.slug}`,
            group: "Players" as const,
            label: p.nickname,
            hint: p.rosters?.[0]?.team.name,
            href: `/cs2/players/${p.slug}`,
          })),
          ...data.teams.slice(0, 5).map((t: { slug: string; name: string; country?: string }) => ({
            key: `t:${t.slug}`,
            group: "Teams" as const,
            label: t.name,
            hint: t.country ?? undefined,
            href: `/cs2/teams/${t.slug}`,
          })),
          ...data.events.slice(0, 4).map((e: { slug: string; name: string }) => ({
            key: `e:${e.slug}`,
            group: "Events" as const,
            label: e.name,
            href: `/cs2/events/${e.slug}`,
          })),
        ];
        setRemote(items);
        setSelected(0);
        } catch {
          /* network hiccup — palette stays usable with commands */
        }
      },
      q.length < 2 ? 0 : 150
    );
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  const items = useMemo<Item[]>(() => {
    const commands = COMMANDS.map((c) => ({
      c,
      score: fuzzyScore(query, c.label),
    }))
      .filter((x): x is { c: (typeof COMMANDS)[number]; score: number } => x.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, query ? 4 : 6)
      .map(({ c }) => ({
        key: `c:${c.href}:${c.label}`,
        group: "Commands" as const,
        label: c.label,
        hint: c.hint,
        href: c.href,
      }));

    const recent = query
      ? []
      : readRecent().map((r) => ({
          key: `r:${r.href}`,
          group: "Recent" as const,
          label: r.label,
          href: r.href,
        }));

    return [...remote, ...commands, ...recent];
  }, [query, remote]);

  const go = useCallback(
    (item: Item) => {
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-canvas/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-edge bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && items[selected]) {
              e.preventDefault();
              go(items[selected]);
            }
          }}
          placeholder="Search players, teams, events — or type a command…"
          aria-label="Search"
          className="w-full border-b border-edge bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-muted"
        />
        <ul role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {query.trim().length >= 2
                ? "No matches — try a different spelling."
                : "Type to search the whole database."}
            </li>
          )}
          {items.map((item, i) => {
            const groupStart = i === 0 || items[i - 1].group !== item.group;
            return (
              <li key={item.key} role="presentation">
                {groupStart && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    {item.group}
                  </div>
                )}
                <button
                  role="option"
                  aria-selected={i === selected}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm ${
                    i === selected ? "bg-surface-2 text-fg" : "text-muted"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="shrink-0 text-xs text-muted">{item.hint}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-edge px-4 py-2 text-[10px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
