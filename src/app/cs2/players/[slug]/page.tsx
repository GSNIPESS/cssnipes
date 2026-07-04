import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { Card, EmptyState, Table, Td, Th, TeamLink } from "@/components/ui";
import { formatDate, formatDecimal } from "@/lib/format";
import {
  getPlayerBySlug,
  getPlayerCareerTotals,
  getPlayerRecentStats,
  getPlayerResearch,
} from "@/lib/queries/players";
import { getSimilarPlayers } from "@/analytics";
import { prisma } from "@/lib/prisma";
import { formatPercent } from "@/lib/format";
import { PlayerLink } from "@/components/ui";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) notFound();

  const [career, recentStats, similar, research] = await Promise.all([
    getPlayerCareerTotals(player.id),
    getPlayerRecentStats(player.id, 15),
    getSimilarPlayers(prisma, player.id),
    getPlayerResearch(player.id),
  ]);

  const currentRoster = player.rosters.find((r) => r.endDate === null);
  const form = player.rollingStats[0];

  return (
    <>
      <div className="mb-8 rounded-lg border border-edge bg-surface p-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl font-bold">{player.nickname}</h1>
          {(player.firstName || player.lastName) && (
            <span className="text-muted">
              {[player.firstName, player.lastName].filter(Boolean).join(" ")}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {currentRoster && (
            <span>
              Team:{" "}
              <TeamLink
                slug={currentRoster.team.slug}
                name={currentRoster.team.name}
              />
            </span>
          )}
          <span>Role: <span className="font-mono">{player.role}</span></span>
          {player.country && <span>Country: {player.country}</span>}
          <span>{player.isActive ? "Active" : "Inactive"}</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Career rating" value={career.maps ? formatDecimal(career.rating) : "—"} highlight={career.rating >= 1} />
          <Stat label="Career ADR" value={career.maps ? formatDecimal(career.adr, 1) : "—"} />
          <Stat
            label="Career K/D"
            value={
              career.deaths > 0
                ? formatDecimal(career.kills / career.deaths)
                : "—"
            }
          />
          <Stat label="Maps recorded" value={String(career.maps)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {recentStats.length >= 2 && (
            <Card title="Form trend (rating per map, oldest → newest)">
              <TimeSeriesChart
                points={[...recentStats].reverse().map((s, i) => ({
                  label: `${i + 1}. ${s.matchMap.map.displayName}`,
                  value: s.rating,
                }))}
                referenceValue={1}
              />
            </Card>
          )}

          <Card title="Team results while rostered">
            {research.career && research.career.played > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat
                  label="Career record"
                  value={`${research.career.won}W – ${research.career.lost}L`}
                />
                <Stat
                  label="Career win rate"
                  value={formatPercent(research.career.won / research.career.played)}
                  highlight={research.career.won / research.career.played >= 0.5}
                />
                <Stat
                  label="Last 90 days"
                  value={
                    research.recent && research.recent.played > 0
                      ? `${research.recent.won}W – ${research.recent.lost}L`
                      : "—"
                  }
                />
                <Stat label="Events appeared" value={String(research.eventCount)} />
              </div>
            ) : (
              <EmptyState>
                No recorded team matches during this player&apos;s roster history.
              </EmptyState>
            )}
            <p className="mt-3 text-xs text-muted">
              Computed from this player&apos;s teams&apos; completed matches during their
              recorded roster memberships.
            </p>
          </Card>

          <Card title="Recent maps">
            {recentStats.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Match</Th>
                    <Th>Map</Th>
                    <Th align="right">K-D-A</Th>
                    <Th align="right">ADR</Th>
                    <Th align="right">Rating</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentStats.map((s) => {
                    const match = s.matchMap.match;
                    return (
                      <tr key={s.id}>
                        <Td>
                          <Link
                            href={`/cs2/matches/${match.id}`}
                            className="hover:text-accent"
                          >
                            {match.teamA.name} vs {match.teamB.name}
                          </Link>
                        </Td>
                        <Td>{s.matchMap.map.displayName}</Td>
                        <Td align="right" mono>
                          {s.kills}-{s.deaths}-{s.assists}
                        </Td>
                        <Td align="right" mono>{formatDecimal(s.adr, 1)}</Td>
                        <Td align="right" mono>
                          <span className={s.rating >= 1 ? "text-win" : "text-loss"}>
                            {formatDecimal(s.rating)}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState>
                Map-level player statistics (kills, ADR, KAST) are not exposed
                by the current data provider plan — series results only.
              </EmptyState>
            )}
          </Card>

          <Card title="Team history">
            {player.rosters.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Team</Th>
                    <Th>Role</Th>
                    <Th>From</Th>
                    <Th>To</Th>
                  </tr>
                </thead>
                <tbody>
                  {player.rosters.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <TeamLink slug={r.team.slug} name={r.team.name} />
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-muted">{r.role}</span>
                      </Td>
                      <Td>{formatDate(r.startDate)}</Td>
                      <Td>{r.endDate ? formatDate(r.endDate) : "Present"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>
                The data provider has no roster membership on record for this
                player.
              </EmptyState>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Current form">
            {form ? (
              <dl className="space-y-2 text-sm">
                <FormRow label={`Rating (${form.window.toLowerCase().replace(/_/g, " ")})`} value={formatDecimal(form.rating)} />
                <FormRow label="K/D" value={formatDecimal(form.kd)} />
                <FormRow label="ADR" value={formatDecimal(form.adr, 1)} />
                <FormRow label="KAST" value={`${formatDecimal(form.kast, 1)}%`} />
                <FormRow label="Sample" value={`${form.sampleSize} maps`} />
              </dl>
            ) : (
              <EmptyState>
                Form ratings need map-level statistics, which the current data
                provider plan does not expose.
              </EmptyState>
            )}
          </Card>

          <Card title="Similar players (by current form)">
            {similar.length ? (
              <ul className="space-y-2 text-sm">
                {similar.map((s) => (
                  <li key={s.playerId} className="flex items-center justify-between">
                    <span>
                      <PlayerLink slug={s.slug} nickname={s.nickname} />
                      {s.team && (
                        <span className="ml-2 text-xs text-muted">{s.team.name}</span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {formatPercent(s.similarity)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>
                Similarity needs map-level form data, which the current data
                provider plan does not expose.
              </EmptyState>
            )}
          </Card>

          <Card title="Event appearances">
            {research.events.length ? (
              <ul className="space-y-2 text-sm">
                {research.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/cs2/events/${e.slug}`}
                      className="truncate hover:text-accent"
                    >
                      {e.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">
                      {formatDate(e.startDate)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>
                No events on record during this player&apos;s roster history.
              </EmptyState>
            )}
          </Card>

          <Card title="Teammates (roster overlap)">
            {research.teammates.length ? (
              <ul className="space-y-2 text-sm">
                {research.teammates.map((m) => (
                  <li key={m.slug} className="flex items-center justify-between">
                    <PlayerLink slug={m.slug} nickname={m.nickname} />
                    <span className="text-xs text-muted">{m.team}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No overlapping roster memberships recorded.</EmptyState>
            )}
          </Card>

          <Card title="Transfers">
            {player.transfers.length ? (
              <ul className="space-y-3 text-sm">
                {player.transfers.map((t) => (
                  <li key={t.id}>
                    <div className="text-muted">{formatDate(t.date)} · {t.type}</div>
                    <div>
                      {t.fromTeam?.name ?? "Free agent"} →{" "}
                      {t.toTeam?.name ?? "Free agent"}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No transfer history.</EmptyState>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${highlight ? "text-win" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function FormRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
