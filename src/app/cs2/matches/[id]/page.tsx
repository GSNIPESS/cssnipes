import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Table, Td, Th, TeamLink, PlayerLink } from "@/components/ui";
import { formatDateTime, formatDecimal } from "@/lib/format";
import { getMatchDetail } from "@/lib/queries/matches";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) notFound();

  const completed = match.status === "COMPLETED";

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
