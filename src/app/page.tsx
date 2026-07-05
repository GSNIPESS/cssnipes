import Link from "next/link";
import { Badge, Card, EmptyState, TeamLink } from "@/components/ui";
import { MatchList, MatchRow } from "@/components/match-row";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  getDatabaseStatus,
  getFeaturedMatch,
  getMostActiveTeams,
  getOngoingEvents,
  getRatingMovers,
  getUpcomingEvents,
} from "@/lib/queries/dashboard";
import {
  getCompletedMatches,
  getLiveMatches,
  getUpcomingMatches,
} from "@/lib/queries/matches";
import { getLatestTeamRatings } from "@/lib/queries/rankings";
import { RatingSystem } from "@/generated/prisma/client";

// Live research dashboard over the whole database.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [
    featured,
    live,
    upcoming,
    recent,
    elo,
    movers,
    active,
    upcomingEvents,
    ongoingEvents,
    status,
  ] = await Promise.all([
    getFeaturedMatch(),
    getLiveMatches(4),
    getUpcomingMatches(4),
    getCompletedMatches(4),
    getLatestTeamRatings(RatingSystem.ELO),
    getRatingMovers(7),
    getMostActiveTeams(30),
    getUpcomingEvents(5),
    getOngoingEvents(4),
    getDatabaseStatus(),
  ]);
  const top10 = elo.rows.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="rounded-lg border border-edge bg-surface p-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
          CS2 research terminal
        </p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold sm:text-4xl">
          Every match since 2016. Every rating. Zero guesswork.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          {status.matches.toLocaleString("en-US")} matches ·{" "}
          {status.teams.toLocaleString("en-US")} teams ·{" "}
          {status.players.toLocaleString("en-US")} players ·{" "}
          {status.events.toLocaleString("en-US")} events — rated by Elo,
          Glicko-2 and TrueSkill, rebuilt from raw results.
          {status.lastSyncAt && ` Last sync ${formatDateTime(status.lastSyncAt)}.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/cs2"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-dim"
          >
            Open CS2 →
          </Link>
          <Link
            href="/cs2/rankings"
            className="rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:border-accent"
          >
            Rankings
          </Link>
          <Link
            href="/cs2/compare"
            className="rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:border-accent"
          >
            Compare
          </Link>
          <span className="ml-auto hidden items-center gap-1 self-center text-xs text-muted sm:flex">
            Press <kbd className="rounded border border-edge bg-surface-2 px-1.5 py-0.5 font-mono">⌘K</kbd>{" "}
            or <kbd className="rounded border border-edge bg-surface-2 px-1.5 py-0.5 font-mono">/</kbd>{" "}
            to search anything
          </span>
        </div>
        <p className="mt-4 text-xs text-muted/60">
          NHL and MLB modules are reserved for a future release.
        </p>
      </section>

      {/* Featured + Top 10 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {featured && (
            <Card title="Featured match" action={<Badge value={featured.status} />}>
              <MatchRow match={featured} />
            </Card>
          )}

          {live.length > 0 && (
            <Card title="Live now" action={<ViewAll href="/cs2/matches?tab=live" />}>
              <MatchList matches={live} />
            </Card>
          )}

          <Card title="Up next" action={<ViewAll href="/cs2/matches?tab=upcoming" />}>
            {upcoming.length ? (
              <MatchList matches={upcoming} />
            ) : (
              <EmptyState>No scheduled matches right now.</EmptyState>
            )}
          </Card>

          <Card title="Latest results" action={<ViewAll href="/cs2/matches?tab=completed" />}>
            {recent.length ? (
              <MatchList matches={recent} />
            ) : (
              <EmptyState>No completed matches yet.</EmptyState>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Top 10 (Elo)" action={<ViewAll href="/cs2/rankings" />}>
            <ol className="space-y-2">
              {top10.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-mono text-muted">{i + 1}</span>
                  <TeamLink slug={r.team.slug} name={r.team.name} />
                  <span className="ml-auto font-mono text-xs text-muted">
                    {Math.round(r.rating)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={`Rating movers (${movers.windowDays}d)`}>
            {movers.risers.length || movers.fallers.length ? (
              <div className="space-y-3 text-sm">
                <MoverList label="Rising" items={movers.risers} up />
                <MoverList label="Falling" items={movers.fallers} up={false} />
              </div>
            ) : (
              <EmptyState>No rating changes in the window.</EmptyState>
            )}
          </Card>

          <Card title="Most active (30d)">
            <ul className="space-y-2 text-sm">
              {active.map((t) => (
                <li key={t.slug} className="flex items-center justify-between">
                  <TeamLink slug={t.slug} name={t.name} />
                  <span className="font-mono text-xs text-muted">
                    {t.won}W / {t.played}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* Events + time machine */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Ongoing events" action={<ViewAll href="/cs2/events" />}>
          {ongoingEvents.length ? (
            <ul className="space-y-2 text-sm">
              {ongoingEvents.map((e) => (
                <li key={e.slug} className="flex items-center justify-between gap-2">
                  <Link href={`/cs2/events/${e.slug}`} className="truncate hover:text-accent">
                    {e.name}
                  </Link>
                  <Badge value={e.tier} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No events in progress.</EmptyState>
          )}
        </Card>

        <Card title="Upcoming tournaments">
          {upcomingEvents.length ? (
            <ul className="space-y-2 text-sm">
              {upcomingEvents.map((e) => (
                <li key={e.slug} className="flex items-center justify-between gap-2">
                  <Link href={`/cs2/events/${e.slug}`} className="truncate hover:text-accent">
                    {e.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">
                    {formatDate(e.startDate)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nothing announced yet.</EmptyState>
          )}
        </Card>

        <Card title="Time machine">
          <p className="mb-3 text-sm text-muted">
            Reconstruct the rating table for any date back to January 2016.
          </p>
          <form action="/cs2/rankings" method="get" className="flex gap-2">
            <input
              type="date"
              name="date"
              aria-label="Snapshot date"
              min="2016-01-13"
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-dim"
            >
              View
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs text-muted hover:text-accent">
      View all →
    </Link>
  );
}

function MoverList({
  label,
  items,
  up,
}: {
  label: string;
  items: Array<{ slug: string; name: string; delta: number; now: number }>;
  up: boolean;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </h3>
      <ul className="space-y-1.5">
        {items.map((m) => (
          <li key={m.slug} className="flex items-center justify-between">
            <TeamLink slug={m.slug} name={m.name} />
            <span className={`font-mono text-xs ${up ? "text-win" : "text-loss"}`}>
              {up ? "+" : ""}
              {Math.round(m.delta)} → {Math.round(m.now)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
