import type { Metadata } from "next";
import { EmptyState, PageTitle, PlayerLink, Table, Td, Th, TeamLink } from "@/components/ui";
import { formatDecimal } from "@/lib/format";
import { getPlayersOverview } from "@/lib/queries/players";

export const metadata: Metadata = { title: "Players" };

export default async function PlayersPage() {
  const players = await getPlayersOverview();

  if (!players.length) {
    return (
      <>
        <PageTitle>Players</PageTitle>
        <EmptyState>No players in the database yet.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageTitle subtitle="Active players ordered by recent form (last 10 maps).">
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
