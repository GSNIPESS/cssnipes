import type { Metadata } from "next";
import { Card, EmptyState, PageTitle, Table, Td, Th, TeamLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getLatestRankings, getLatestTeamRatings } from "@/lib/queries/rankings";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // Historical snapshot: ?date=YYYY-MM-DD shows the rating table as it stood
  // at end of that day, resolved from stored per-match rating history.
  const { date } = await searchParams;
  const parsed = date ? new Date(`${date}T23:59:59Z`) : undefined;
  const asOf =
    parsed && !Number.isNaN(parsed.getTime()) && parsed < new Date()
      ? parsed
      : undefined;

  const [hltv, elo, glicko, trueskill] = await Promise.all([
    getLatestRankings(RankingSource.HLTV),
    getLatestTeamRatings(RatingSystem.ELO, asOf),
    getLatestTeamRatings(RatingSystem.GLICKO, asOf),
    getLatestTeamRatings(RatingSystem.TRUESKILL, asOf),
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
  const allModelRows = [...bySlug.values()].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
  const modelRows = allModelRows.slice(0, 100);

  return (
    <>
      <PageTitle
        subtitle={
          asOf
            ? `Historical snapshot — ratings as of ${formatDate(asOf)}.`
            : "External world ranking and internal model ratings, latest state."
        }
      >
        Rankings
      </PageTitle>

      <form action="/cs2/rankings" method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
            View any date (2016 → today)
          </span>
          <input
            type="date"
            name="date"
            defaultValue={date ?? ""}
            min="2016-01-13"
            max={new Date().toISOString().slice(0, 10)}
            className="rounded-md border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-dim"
        >
          View snapshot
        </button>
        {asOf && (
          <a
            href="/cs2/rankings"
            className="rounded-md border border-edge px-4 py-2 text-sm text-muted transition-colors hover:border-accent"
          >
            Back to latest
          </a>
        )}
      </form>

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
              <span className="text-xs text-muted">
                Top {modelRows.length} of {allModelRows.length} rated teams ·{" "}
                {formatDate(elo.date)}
              </span>
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
