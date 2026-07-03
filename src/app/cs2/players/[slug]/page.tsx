import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, Table, Td, Th, TeamLink } from "@/components/ui";
import { formatDate, formatDecimal } from "@/lib/format";
import {
  getPlayerBySlug,
  getPlayerCareerTotals,
  getPlayerRecentStats,
} from "@/lib/queries/players";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) notFound();

  const [career, recentStats] = await Promise.all([
    getPlayerCareerTotals(player.id),
    getPlayerRecentStats(player.id, 15),
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
              <EmptyState>No recorded maps yet.</EmptyState>
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
              <EmptyState>No roster history.</EmptyState>
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
              <EmptyState>No form data.</EmptyState>
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
