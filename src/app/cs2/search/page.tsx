import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, PageTitle, PlayerLink, TeamLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { searchAll } from "@/lib/queries/search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = await searchAll(q);
  const total =
    results.players.length + results.teams.length + results.events.length;

  return (
    <>
      <PageTitle subtitle="Find players, teams, and events.">Search</PageTitle>

      <form action="/cs2/search" method="get" className="mb-8 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Player, team, or event name…"
          autoFocus
          className="w-full max-w-md rounded-md border border-edge bg-surface px-4 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-dim"
        >
          Search
        </button>
      </form>

      {q.trim() &&
        (total === 0 ? (
          <EmptyState>No results for “{q}”.</EmptyState>
        ) : (
          <div className="space-y-6">
            {results.players.length > 0 && (
              <Card title={`Players (${results.players.length})`}>
                <ul className="space-y-2 text-sm">
                  {results.players.map((p) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <PlayerLink slug={p.slug} nickname={p.nickname} />
                      <span className="text-muted">
                        {p.rosters[0]?.team.name ?? "Free agent"}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {results.teams.length > 0 && (
              <Card title={`Teams (${results.teams.length})`}>
                <ul className="space-y-2 text-sm">
                  {results.teams.map((t) => (
                    <li key={t.id} className="flex items-center justify-between">
                      <TeamLink slug={t.slug} name={t.name} />
                      <span className="text-muted">{t.country ?? ""}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {results.events.length > 0 && (
              <Card title={`Events (${results.events.length})`}>
                <ul className="space-y-2 text-sm">
                  {results.events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between">
                      <Link
                        href={`/cs2/events/${e.slug}`}
                        className="font-medium hover:text-accent"
                      >
                        {e.name}
                      </Link>
                      <span className="text-muted">{formatDate(e.startDate)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        ))}
    </>
  );
}
