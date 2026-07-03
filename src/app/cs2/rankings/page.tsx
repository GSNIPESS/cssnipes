import type { Metadata } from "next";
import { Card, EmptyState, PageTitle, Table, Td, Th, TeamLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getLatestRankings, getLatestTeamRatings } from "@/lib/queries/rankings";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage() {
  const [hltv, elo] = await Promise.all([
    getLatestRankings(RankingSource.HLTV),
    getLatestTeamRatings(RatingSystem.ELO),
  ]);

  return (
    <>
      <PageTitle subtitle="External world ranking and internal Elo, latest snapshots.">
        Rankings
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="World ranking (HLTV)"
          action={
            hltv.date && (
              <span className="text-xs text-muted">{formatDate(hltv.date)}</span>
            )
          }
        >
          {hltv.rows.length ? (
            <Table>
              <thead>
                <tr>
                  <Th align="right">#</Th>
                  <Th>Team</Th>
                  <Th align="right">Points</Th>
                </tr>
              </thead>
              <tbody>
                {hltv.rows.map((r) => (
                  <tr key={r.id}>
                    <Td align="right" mono>{r.rank}</Td>
                    <Td>
                      <TeamLink slug={r.team.slug} name={r.team.name} />
                    </Td>
                    <Td align="right" mono>{r.points ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>No ranking snapshots yet.</EmptyState>
          )}
        </Card>

        <Card
          title="Internal Elo"
          action={
            elo.date && (
              <span className="text-xs text-muted">{formatDate(elo.date)}</span>
            )
          }
        >
          {elo.rows.length ? (
            <Table>
              <thead>
                <tr>
                  <Th align="right">#</Th>
                  <Th>Team</Th>
                  <Th align="right">Elo</Th>
                </tr>
              </thead>
              <tbody>
                {elo.rows.map((r, i) => (
                  <tr key={r.id}>
                    <Td align="right" mono>{i + 1}</Td>
                    <Td>
                      <TeamLink slug={r.team.slug} name={r.team.name} />
                    </Td>
                    <Td align="right" mono>{Math.round(r.rating)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>No Elo snapshots yet.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
