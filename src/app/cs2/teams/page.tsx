import type { Metadata } from "next";
import { EmptyState, PageTitle, Table, Td, Th, TeamLink } from "@/components/ui";
import { getTeamsOverview } from "@/lib/queries/teams";

export const metadata: Metadata = { title: "Teams" };

const PAGE_CAP = 200;

export default async function TeamsPage() {
  const all = await getTeamsOverview();
  const teams = all.slice(0, PAGE_CAP);

  if (!teams.length) {
    return (
      <>
        <PageTitle>Teams</PageTitle>
        <EmptyState>No teams in the database yet.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageTitle
        subtitle={`Top ${teams.length} of ${all.length} teams by rating. Use Search to find anyone else.`}
      >
        Teams
      </PageTitle>
      <Table>
        <thead>
          <tr>
            <Th align="right">Rank</Th>
            <Th>Team</Th>
            <Th>Country</Th>
            <Th align="right">Elo</Th>
            <Th align="right">Active players</Th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id}>
              <Td align="right" mono>{t.rank ?? "—"}</Td>
              <Td>
                <TeamLink slug={t.slug} name={t.name} />
              </Td>
              <Td>{t.country ?? "—"}</Td>
              <Td align="right" mono>{t.elo ? Math.round(t.elo) : "—"}</Td>
              <Td align="right" mono>{t.activePlayers}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
