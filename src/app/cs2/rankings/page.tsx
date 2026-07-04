import type { Metadata } from "next";
import { Card, EmptyState, PageTitle, Table, Td, Th, TeamLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getLatestRankings, getLatestTeamRatings } from "@/lib/queries/rankings";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage() {
  const [hltv, elo, glicko, trueskill] = await Promise.all([
    getLatestRankings(RankingSource.HLTV),
    getLatestTeamRatings(RatingSystem.ELO),
    getLatestTeamRatings(RatingSystem.GLICKO),
    getLatestTeamRatings(RatingSystem.TRUESKILL),
  ]);

  // Merge the three systems into one row per team, ordered by Elo.
  const bySlug = new Map<
    string,
    { slug: string; name: string; elo?: number; glicko?: number; rd?: number; ts?: number }
  >();
  for (const r of elo.rows) {
    bySlug.set(r.team.slug, { slug: r.team.slug, name: r.team.name, elo: r.rating });
  }
  for (const r of glicko.rows) {
    const row = bySlug.get(r.team.slug) ?? { slug: r.team.slug, name: r.team.name };
    row.glicko = r.rating;
    row.rd = r.deviation ?? undefined;
    bySlug.set(r.team.slug, row);
  }
  for (const r of trueskill.rows) {
    const row = bySlug.get(r.team.slug) ?? { slug: r.team.slug, name: r.team.name };
    row.ts = r.rating;
    bySlug.set(r.team.slug, row);
  }
  const modelRows = [...bySlug.values()].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));

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
            <EmptyState>
              External world rankings (HLTV/Valve) are not exposed by the
              current data provider. The model ratings alongside are computed
              internally from match results.
            </EmptyState>
          )}
        </Card>

        <Card
          title="Model ratings (Elo · Glicko-2 · TrueSkill)"
          action={
            elo.date && (
              <span className="text-xs text-muted">{formatDate(elo.date)}</span>
            )
          }
        >
          {modelRows.length ? (
            <Table>
              <thead>
                <tr>
                  <Th align="right">#</Th>
                  <Th>Team</Th>
                  <Th align="right">Elo</Th>
                  <Th align="right">Glicko ± RD</Th>
                  <Th align="right">TS μ</Th>
                </tr>
              </thead>
              <tbody>
                {modelRows.map((r, i) => (
                  <tr key={r.slug}>
                    <Td align="right" mono>{i + 1}</Td>
                    <Td>
                      <TeamLink slug={r.slug} name={r.name} />
                    </Td>
                    <Td align="right" mono>{r.elo ? Math.round(r.elo) : "—"}</Td>
                    <Td align="right" mono>
                      {r.glicko ? Math.round(r.glicko) : "—"}
                      {r.rd ? ` ±${Math.round(r.rd)}` : ""}
                    </Td>
                    <Td align="right" mono>{r.ts ? r.ts.toFixed(1) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>
              No model ratings yet — run npm run analytics after ingesting results.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
