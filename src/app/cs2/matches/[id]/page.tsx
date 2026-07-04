import Link from "next/link";
import { notFound } from "next/navigation";
import { projectMatch } from "@/analytics/projection";
import { ProbabilityBar } from "@/components/probability-bar";
import { Badge, Card, EmptyState, Table, Td, Th, TeamLink, PlayerLink } from "@/components/ui";
import { formatDateTime, formatDecimal } from "@/lib/format";
import { getMatchDetail } from "@/lib/queries/matches";
import { prisma } from "@/lib/prisma";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) notFound();

  const completed = match.status === "COMPLETED";
  const pending = match.status === "SCHEDULED" || match.status === "LIVE";
  const projection = pending ? await projectMatch(prisma, id) : null;

  return (
    <>
      <div className="mb-8 rounded-lg border border-edge bg-surface p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge value={match.status} />
          <span className="font-mono">BO{match.bestOf}</span>
          {match.stage && <span>· {match.stage}</span>}
          <span>·</span>
          <Link href={`/cs2/events/${match.event.slug}`} className="hover:text-accent">
            {match.event.name}
          </Link>
          <span>·</span>
          <span>{formatDateTime(match.scheduledAt)}</span>
        </div>
        <div className="flex items-center justify-center gap-6 text-center sm:gap-12">
          <div className="flex-1 text-right">
            <TeamLink
              slug={match.teamA.slug}
              name={match.teamA.name}
              className="text-xl sm:text-2xl"
            />
          </div>
          <div className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">
            {completed || match.status === "LIVE" ? (
              <>
                <span className={match.winnerId === match.teamA.id ? "text-win" : ""}>
                  {match.scoreA}
                </span>
                <span className="text-muted"> : </span>
                <span className={match.winnerId === match.teamB.id ? "text-win" : ""}>
                  {match.scoreB}
                </span>
              </>
            ) : (
              <span className="text-muted">vs</span>
            )}
          </div>
          <div className="flex-1 text-left">
            <TeamLink
              slug={match.teamB.slug}
              name={match.teamB.name}
              className="text-xl sm:text-2xl"
            />
          </div>
        </div>
      </div>

      {projection?.available && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card title="Projection (CSSNIPES Model v1)">
            <ProbabilityBar
              labelA={projection.teamA}
              labelB={projection.teamB}
              probA={projection.probA}
            />
            <dl className="mt-4 space-y-1 text-xs text-muted">
              <ProjectionRow
                label="Rating blend (Elo · Glicko-2 · TrueSkill)"
                value={
                  projection.components.ratingBlend !== null
                    ? `${Math.round(projection.components.ratingBlend * 100)}% ${projection.teamA}`
                    : "no rating history"
                }
              />
              <ProjectionRow
                label="Opponent-weighted form (last 10)"
                value={`${signed(projection.components.formAdjustment * 100)}pp · samples ${projection.coverage.formA}/${projection.coverage.formB}`}
              />
              <ProjectionRow
                label="Map component"
                value={
                  projection.coverage.maps
                    ? `${signed(projection.components.mapAdjustment * 100)}pp from predicted maps`
                    : "no per-map history from provider (contributes 0)"
                }
              />
              <ProjectionRow label="Confidence" value={projection.confidence} />
            </dl>
            <p className="mt-3 text-xs text-muted">
              Deterministic research projection computed from stored results
              only — not betting advice.
            </p>
          </Card>

          <Card title="Predicted pick/ban">
            {projection.veto.available ? (
              <ol className="space-y-1.5 text-sm">
                {projection.veto.steps.map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span
                      className={`w-14 shrink-0 font-mono text-xs uppercase ${
                        s.action === "pick"
                          ? "text-win"
                          : s.action === "decider"
                            ? "text-accent"
                            : "text-loss"
                      }`}
                    >
                      {s.action}
                    </span>
                    <span className="font-medium">{s.mapName}</span>
                    <span className="truncate text-xs text-muted">{s.reason}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState>{projection.veto.reason}</EmptyState>
            )}
          </Card>
        </div>
      )}

      {match.maps.length === 0 && (
        <p className="text-center text-sm text-muted">
          {match.status === "SCHEDULED"
            ? "Map picks will appear once available."
            : "Per-map details are not exposed by the current data provider plan — series score only."}
        </p>
      )}

      <div className="space-y-6">
        {match.maps.map((mm) => (
          <Card
            key={mm.id}
            title={`Map ${mm.mapNumber} — ${mm.map.displayName}`}
            action={
              mm.pickedBy ? (
                <span className="text-xs text-muted">
                  Pick: {mm.pickedBy.name}
                </span>
              ) : (
                <span className="text-xs text-muted">Decider</span>
              )
            }
          >
            <div className="mb-4 text-center font-mono text-2xl font-bold tabular-nums">
              <span className={mm.winnerId === match.teamA.id ? "text-win" : ""}>
                {mm.scoreA}
              </span>
              <span className="text-muted"> : </span>
              <span className={mm.winnerId === match.teamB.id ? "text-win" : ""}>
                {mm.scoreB}
              </span>
            </div>

            {mm.stats.length > 0 &&
              [match.teamA, match.teamB].map((team) => {
                const rows = mm.stats.filter((s) => s.team.id === team.id);
                if (!rows.length) return null;
                return (
                  <div key={team.id} className="mb-4 last:mb-0">
                    <h3 className="mb-2 text-sm font-semibold">{team.name}</h3>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Player</Th>
                          <Th align="right">K</Th>
                          <Th align="right">D</Th>
                          <Th align="right">A</Th>
                          <Th align="right">ADR</Th>
                          <Th align="right">KAST</Th>
                          <Th align="right">Rating</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => (
                          <tr key={s.id}>
                            <Td>
                              <PlayerLink
                                slug={s.player.slug}
                                nickname={s.player.nickname}
                              />
                            </Td>
                            <Td align="right" mono>{s.kills}</Td>
                            <Td align="right" mono>{s.deaths}</Td>
                            <Td align="right" mono>{s.assists}</Td>
                            <Td align="right" mono>{formatDecimal(s.adr, 1)}</Td>
                            <Td align="right" mono>{formatDecimal(s.kast, 1)}%</Td>
                            <Td align="right" mono>
                              <span className={s.rating >= 1 ? "text-win" : "text-loss"}>
                                {formatDecimal(s.rating)}
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                );
              })}
          </Card>
        ))}
      </div>
    </>
  );
}

function ProjectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </div>
  );
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}
