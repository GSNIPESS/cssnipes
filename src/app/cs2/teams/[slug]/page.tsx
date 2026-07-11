import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BarRatioChart } from "@/components/charts/bar-ratio-chart";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { ResearchSplitsSections } from "@/components/research-sections";
import { TendenciesCard } from "@/components/tendencies-card";
import { Card, EmptyState, PlayerLink, Table, Td, Th } from "@/components/ui";
import { getRosterStability, getTeamResearchSplits } from "@/lib/queries/research";
import { MatchList } from "@/components/match-row";
import { formatDate, formatPercent } from "@/lib/format";
import { getTeamBySlug, getTeamRecord } from "@/lib/queries/teams";
import { getTeamRecentMatches } from "@/lib/queries/matches";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await prisma.team.findUnique({
    where: { slug },
    select: { name: true },
  });
  return { title: team ? `${team.name} — Team` : "Team" };
}

export default async function TeamProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const [record, recentMatches, research, stability] = await Promise.all([
    getTeamRecord(team.id),
    getTeamRecentMatches(team.id, 10),
    getTeamResearchSplits(team.id),
    getRosterStability(team.id),
  ]);
  const { splits, tendencies } = research;

  const latestRanking = team.rankings[0];
  const latestElo = team.ratings.find((r) => r.system === "ELO");

  // Latest map-strength snapshot per map.
  const seenMaps = new Set<string>();
  const mapStrengths = team.mapStrengths.filter((ms) => {
    if (seenMaps.has(ms.mapId)) return false;
    seenMaps.add(ms.mapId);
    return true;
  });

  return (
    <>
      <div className="mb-8 rounded-lg border border-edge bg-surface p-6">
        <h1 className="text-3xl font-bold">{team.name}</h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {team.country && <span>Country: {team.country}</span>}
          {team.foundedAt && <span>Founded: {formatDate(team.foundedAt)}</span>}
          {team.disbanded && <span className="text-loss">Disbanded</span>}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="World rank" value={latestRanking ? `#${latestRanking.rank}` : "—"} />
          <Stat label="Elo" value={latestElo ? String(Math.round(latestElo.rating)) : "—"} />
          <Stat label="Record" value={`${record.won}W – ${record.lost}L`} />
          <Stat
            label="Win rate"
            value={record.played ? formatPercent(record.won / record.played) : "—"}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {team.ratings.length >= 2 && (
            <Card title="Elo history">
              <TimeSeriesChart
                points={[...team.ratings]
                  .filter((r) => r.system === "ELO")
                  .reverse()
                  .map((r) => ({ label: formatDate(r.date), value: Math.round(r.rating) }))}
              />
            </Card>
          )}

          {mapStrengths.length >= 2 && (
            <Card title="Map win rates">
              <BarRatioChart
                points={mapStrengths.map((ms) => ({
                  label: ms.map.displayName,
                  ratio: ms.winRate,
                }))}
              />
            </Card>
          )}

          <ResearchSplitsSections splits={splits} subject="team" />

          <TendenciesCard tendencies={tendencies} />

          <Card title="Recent matches">
            {recentMatches.length ? (
              <MatchList matches={recentMatches} />
            ) : (
              <EmptyState>
                The data provider has no matches on record for this team.
              </EmptyState>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Active roster">
            {team.rosters.length ? (
              <ul className="space-y-2 text-sm">
                {team.rosters.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <PlayerLink slug={r.player.slug} nickname={r.player.nickname} />
                    <span className="font-mono text-xs text-muted">{r.role}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>
                The data provider lists no current players for this team
                (disbanded, inactive, or roster not tracked).
              </EmptyState>
            )}
          </Card>

          <Card title="Roster stability">
            {stability ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Lineup changes / year</dt>
                  <dd className="font-mono">{stability.changesPerYear.toFixed(1)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Avg current tenure</dt>
                  <dd className="font-mono">
                    {stability.avgTenureDays !== null
                      ? `${Math.round(stability.avgTenureDays)}d`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Roster tracked since</dt>
                  <dd className="font-mono">{formatDate(stability.observedFrom)}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState>No roster history tracked for this team.</EmptyState>
            )}
            <p className="mt-3 text-xs text-muted">
              Based on observed membership changes since our tracking began —
              the provider does not expose historical join dates.
            </p>
          </Card>

          <Card title="Map strengths">
            {mapStrengths.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Map</Th>
                    <Th align="right">Win rate</Th>
                    <Th align="right">Maps</Th>
                  </tr>
                </thead>
                <tbody>
                  {mapStrengths.map((ms) => (
                    <tr key={ms.id}>
                      <Td>{ms.map.displayName}</Td>
                      <Td align="right" mono>
                        <span className={ms.winRate >= 0.5 ? "text-win" : "text-loss"}>
                          {formatPercent(ms.winRate)}
                        </span>
                      </Td>
                      <Td align="right" mono>{ms.sampleSize}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>
                Per-map results are not exposed by the current data provider
                plan (series scores only).
              </EmptyState>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold">{value}</div>
    </div>
  );
}
