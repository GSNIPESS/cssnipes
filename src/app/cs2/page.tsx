import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, PageTitle, PlayerLink, TeamLink } from "@/components/ui";
import { MatchList } from "@/components/match-row";
import { formatDecimal } from "@/lib/format";
import {
  getCompletedMatches,
  getLiveMatches,
  getUpcomingMatches,
} from "@/lib/queries/matches";
import { getLatestRankings, getLatestTeamRatings } from "@/lib/queries/rankings";
import { getPlayersOverview } from "@/lib/queries/players";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "CS2 Overview" };

export default async function Cs2HomePage() {
  const [live, upcoming, recent, rankings, elo, players] = await Promise.all([
    getLiveMatches(5),
    getUpcomingMatches(5),
    getCompletedMatches(5),
    getLatestRankings(RankingSource.HLTV),
    getLatestTeamRatings(RatingSystem.ELO),
    getPlayersOverview(),
  ]);

  // External rankings when available, otherwise internal Elo standings.
  const topTeams = rankings.rows.length
    ? {
        title: "Top teams",
        rows: rankings.rows.slice(0, 5).map((r) => ({ key: r.id, rank: r.rank, team: r.team })),
      }
    : {
        title: "Top teams (Elo)",
        rows: elo.rows.slice(0, 5).map((r, i) => ({ key: r.id, rank: i + 1, team: r.team })),
      };

  const topPlayers = players.filter((p) => p.form).slice(0, 5);

  return (
    <>
      <PageTitle subtitle="Live state of the scene — matches, rankings, and player form.">
        Counter-Strike 2
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {live.length > 0 && (
            <Card title="Live" action={<ViewAll href="/cs2/matches" />}>
              <MatchList matches={live} />
            </Card>
          )}
          <Card title="Upcoming" action={<ViewAll href="/cs2/matches?tab=upcoming" />}>
            {upcoming.length ? (
              <MatchList matches={upcoming} />
            ) : (
              <EmptyState>No scheduled matches.</EmptyState>
            )}
          </Card>
          <Card title="Recent results" action={<ViewAll href="/cs2/matches?tab=completed" />}>
            {recent.length ? (
              <MatchList matches={recent} />
            ) : (
              <EmptyState>No completed matches yet.</EmptyState>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={topTeams.title} action={<ViewAll href="/cs2/rankings" />}>
            {topTeams.rows.length ? (
              <ol className="space-y-2">
                {topTeams.rows.map((r) => (
                  <li key={r.key} className="flex items-center gap-3 text-sm">
                    <span className="w-5 font-mono text-muted">{r.rank}</span>
                    <TeamLink slug={r.team.slug} name={r.team.name} />
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState>No ranking data.</EmptyState>
            )}
          </Card>

          <Card title="In-form players" action={<ViewAll href="/cs2/players" />}>
            {topPlayers.length ? (
              <ol className="space-y-2">
                {topPlayers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <PlayerLink slug={p.slug} nickname={p.nickname} />
                    <span className="font-mono text-win">
                      {formatDecimal(p.form!.rating)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState>
                Player form needs map-level statistics, which the current data
                provider plan does not expose.
              </EmptyState>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs text-muted hover:text-accent">
      View all →
    </Link>
  );
}
