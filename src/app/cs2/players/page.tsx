import type { Metadata } from "next";
import { EmptyState, PageTitle, PlayerLink, Table, Td, Th, TeamLink } from "@/components/ui";
import { formatDecimal } from "@/lib/format";
import { getPlayersOverview } from "@/lib/queries/players";

export const metadata: Metadata = { title: "Players" };

const PAGE_CAP = 200;

export default async function PlayersPage() {
  const all = await getPlayersOverview();
  const players = all.slice(0, PAGE_CAP);

  if (!players.length) {
    return (
      <>
        <PageTitle>Players</PageTitle>
        <EmptyState>
          No players in the database yet — run an ingestion sync
          (see OPERATIONS.md) to populate it.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageTitle
        subtitle={`Top ${players.length} of ${all.length} active players, ordered by recent form where available. Use Search to find anyone else.`}
      >
        Players
      </PageTitle>
      <Table>
        <thead>
          <tr>
            <Th>Player</Th>
            <Th>Team</Th>
            <Th>Country</Th>
            <Th>Role</Th>
            <Th align="right">Form rating</Th>
            <Th align="right">K/D</Th>
            <Th align="right">ADR</Th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <Td>
                <PlayerLink slug={p.slug} nickname={p.nickname} />
              </Td>
              <Td>
                {p.team ? (
                  <TeamLink slug={p.team.slug} name={p.team.name} className="text-muted hover:text-accent" />
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
              <Td>{p.country ?? "—"}</Td>
              <Td>
                <span className="font-mono text-xs text-muted">{p.role}</span>
              </Td>
              <Td align="right" mono>
                {p.form ? (
                  <span className={p.form.rating >= 1 ? "text-win" : "text-loss"}>
                    {formatDecimal(p.form.rating)}
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td align="right" mono>{p.form ? formatDecimal(p.form.kd) : "—"}</Td>
              <Td align="right" mono>{p.form ? formatDecimal(p.form.adr, 1) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
