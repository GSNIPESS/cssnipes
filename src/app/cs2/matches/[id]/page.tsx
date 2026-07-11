import Link from "next/link";
import { notFound } from "next/navigation";
import { projectMatch } from "@/analytics/projection";
import { ProbabilityBar } from "@/components/probability-bar";
import { PlayerScoresheet } from "@/components/player-scoresheet";
import { Badge, Card, EmptyState, Table, Td, Th, TeamLink, PlayerLink } from "@/components/ui";
import { formatDateTime, formatDecimal } from "@/lib/format";
import { getMatchDetail } from "@/lib/queries/matches";
import { getMatchPlayerProps } from "@/lib/queries/player-props";
import { getMatchResearchReport } from "@/lib/queries/match-report";
import { SourceBadge } from "@/components/source-badge";
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
  const [projection, playerProps] = pending
    ? await Promise.all([projectMatch(prisma, id), getMatchPlayerProps(id)])
    : [null, null];
  const report = completed ? await getMatchResearchReport(id) : null;

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

      {report?.available && report.teamA && report.teamB && (
        <div className="mb-6 space-y-6">
          <Card
            title="Research report"
            action={<SourceBadge source="MODEL" />}
          >
            {report.takeaways.length > 0 && (
              <ul className="mb-5 space-y-2">
                {report.takeaways.map((line) => (
                  <li key={line} className="flex items-baseline gap-2 text-sm">
                    <span aria-hidden className="text-accent">▸</span>
                    {line}
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <ReportStat
                label="Pre-match expectation"
                value={
                  report.expectedA !== null
                    ? `${Math.round(report.expectedA * 100)}% ${report.teamA.name}`
                    : "no prior rating"
                }
              />
              <ReportStat
                label="Upset rating"
                value={report.upsetRating !== null ? `${report.upsetRating}/100` : "—"}
                highlight={report.underdogWon === true}
              />
              <ReportStat
                label="H2H entering"
                value={
                  report.h2hEntering.meetings
                    ? `${report.h2hEntering.winsA}–${report.h2hEntering.winsB}`
                    : "first meeting"
                }
              />
              <ReportStat
                label="Form entering (last 10)"
                value={`${report.teamA.formEntering.won}/${report.teamA.formEntering.played} · ${report.teamB.formEntering.won}/${report.teamB.formEntering.played}`}
              />
            </div>

            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
              Rating movement on this result
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[report.teamA, report.teamB].map((side) => (
                <div
                  key={side.id}
                  className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm"
                >
                  <TeamLink slug={side.slug} name={side.name} />
                  <span className="font-mono tabular-nums">
                    {side.eloBefore !== null && side.eloAfter !== null ? (
                      <>
                        {Math.round(side.eloBefore)} →{" "}
                        {Math.round(side.eloAfter)}{" "}
                        <span
                          className={
                            side.eloAfter >= side.eloBefore ? "text-win" : "text-loss"
                          }
                        >
                          ({side.eloAfter >= side.eloBefore ? "+" : ""}
                          {Math.round(side.eloAfter - side.eloBefore)})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">first rated match</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              Computed from rating history as it stood when the match was
              played — pre-match Elo expectation vs the observed result. See
              Methods for formulas.
            </p>
          </Card>
        </div>
      )}

      {projection?.available && (
        <div className="mb-6 space-y-6">
          <Card
            title="Projection (CSSNIPES Model v2)"
            action={
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {projection.simulation.draws.toLocaleString("en-US")} sims ·{" "}
                {projection.confidence} confidence
              </span>
            }
          >
            <ProbabilityBar
              labelA={projection.teamA}
              labelB={projection.teamB}
              probA={projection.probA}
            />
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Model inputs
                </h3>
                <dl className="space-y-1 text-xs text-muted">
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
                        : "no per-map history (contributes 0)"
                    }
                  />
                  <ProjectionRow
                    label="Point estimate (pre-sim)"
                    value={`${Math.round(projection.pointEstimateA * 100)}% ${projection.teamA}`}
                  />
                </dl>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Simulation output
                </h3>
                <dl className="space-y-1 text-xs text-muted">
                  <ProjectionRow
                    label="90% credible interval (map win %)"
                    value={`${Math.round(projection.simulation.ci90[0] * 100)}–${Math.round(projection.simulation.ci90[1] * 100)}%`}
                  />
                  <ProjectionRow
                    label="Expected maps played"
                    value={projection.simulation.expectedMaps.toFixed(2)}
                  />
                  <ProjectionRow
                    label="Upset probability"
                    value={`${Math.round(projection.simulation.upsetProbability * 100)}%`}
                  />
                  <ProjectionRow
                    label="Series format"
                    value={`Best of ${match.bestOf}`}
                  />
                </dl>
              </div>
            </div>

            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
              Series score distribution
            </h3>
            <ul className="space-y-1.5">
              {Object.entries(projection.simulation.scoreDistribution)
                .sort((a, b) => b[1] - a[1])
                .map(([score, p]) => (
                  <li key={score} className="flex items-center gap-3 text-xs">
                    <span className="w-8 shrink-0 font-mono tabular-nums">{score}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded bg-surface-2">
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${Math.round(p * 100)}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted">
                      {Math.round(p * 100)}%
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              {`${projection.simulation.draws.toLocaleString("en-US")} seeded Monte Carlo draws`}{" "}
              (deterministic per match). Skill is sampled from each team&apos;s
              rating deviation, then maps are simulated one by one. Research
              projection from stored results only — not betting advice.
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

          {playerProps && <PlayerScoresheet props={playerProps} />}
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

function ReportStat({
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
      <div
        className={`mt-1 font-mono text-lg font-bold ${highlight ? "text-accent" : ""}`}
      >
        {value}
      </div>
    </div>
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
