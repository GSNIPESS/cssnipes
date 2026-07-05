import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, PageTitle, PlayerLink, Table, Td, Th } from "@/components/ui";
import { formatDate, formatDecimal, formatPercent } from "@/lib/format";
import {
  getCompareOptions,
  getPlayerComparison,
  getTeamComparison,
} from "@/lib/queries/compare";
import { getHeadToHead, getPlayerSharedHistory } from "@/lib/queries/research";

export const metadata: Metadata = { title: "Compare" };

type CompareType = "teams" | "players";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; a?: string; b?: string }>;
}) {
  const params = await searchParams;
  const type: CompareType = params.type === "players" ? "players" : "teams";
  const [teams, players] = await getCompareOptions();

  const options =
    type === "teams"
      ? teams.map((t) => ({ value: t.slug, label: t.name }))
      : players.map((p) => ({ value: p.slug, label: p.nickname }));

  const a = params.a ?? "";
  const b = params.b ?? "";
  const ready = Boolean(a && b && a !== b);

  return (
    <>
      <PageTitle subtitle="Side-by-side team or player comparison.">
        Compare
      </PageTitle>

      <form
        action="/cs2/compare"
        method="get"
        className="mb-8 flex flex-wrap items-end gap-3"
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
            Type
          </span>
          <select name="type" defaultValue={type} className={selectCls}>
            <option value="teams">Teams</option>
            <option value="players">Players</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
            First
          </span>
          <select name="a" defaultValue={a} className={selectCls}>
            <option value="">Select…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
            Second
          </span>
          <select name="b" defaultValue={b} className={selectCls}>
            <option value="">Select…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-dim"
        >
          Compare
        </button>
      </form>

      {!ready ? (
        <EmptyState>
          Pick two different {type} to compare. The dropdowns show currently
          rostered {type}; anyone else can be compared by putting their slug in
          the URL (?a=…&amp;b=…) — find slugs via Search.
        </EmptyState>
      ) : type === "teams" ? (
        <TeamComparison a={a} b={b} />
      ) : (
        <PlayerComparison a={a} b={b} />
      )}
    </>
  );
}

const selectCls =
  "rounded-md border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent min-w-44";

async function TeamComparison({ a, b }: { a: string; b: string }) {
  const [left, right] = await Promise.all([
    getTeamComparison(a),
    getTeamComparison(b),
  ]);
  if (!left || !right) return <EmptyState>Team not found.</EmptyState>;

  const h2h = await getHeadToHead(left.id, right.id);

  const rows: [string, string, string][] = [
    [
      "Head-to-head",
      `${h2h.winsA} wins`,
      `${h2h.winsB} wins`,
    ],
    ["World rank", fmtRank(left.rank), fmtRank(right.rank)],
    [
      "Elo",
      left.elo ? String(Math.round(left.elo)) : "—",
      right.elo ? String(Math.round(right.elo)) : "—",
    ],
    [
      "Record (W–L)",
      `${left.record.won}–${left.record.lost}`,
      `${right.record.won}–${right.record.lost}`,
    ],
    [
      "Win rate",
      left.record.played ? formatPercent(left.record.won / left.record.played) : "—",
      right.record.played ? formatPercent(right.record.won / right.record.played) : "—",
    ],
    [
      "Roster",
      left.roster.map((p) => p.nickname).join(", ") || "—",
      right.roster.map((p) => p.nickname).join(", ") || "—",
    ],
  ];

  return (
    <div className="space-y-6">
      <CompareTable leftName={left.name} rightName={right.name} rows={rows} />

      <Card
        title={`Head-to-head meetings (${h2h.meetings})`}
        action={
          h2h.meetings > 0 ? (
            <span className="font-mono text-xs text-muted">
              {h2h.winsA}–{h2h.winsB}
            </span>
          ) : undefined
        }
      >
        {h2h.recent.length ? (
          <ul className="space-y-2 text-sm">
            {h2h.recent.map((m) => (
              <li key={m.matchId} className="flex items-center justify-between gap-2">
                <Link href={`/cs2/matches/${m.matchId}`} className="truncate hover:text-accent">
                  <span className={m.wonByA ? "text-win" : "text-loss"}>
                    {m.wonByA ? left.name : right.name}
                  </span>{" "}
                  <span className="font-mono">{m.score}</span>
                  <span className="ml-2 text-xs text-muted">{m.event.name}</span>
                </Link>
                <span className="shrink-0 text-xs text-muted">{formatDate(m.date)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>These teams have never met in recorded matches.</EmptyState>
        )}
      </Card>
    </div>
  );
}

async function PlayerComparison({ a, b }: { a: string; b: string }) {
  const [left, right] = await Promise.all([
    getPlayerComparison(a),
    getPlayerComparison(b),
  ]);
  if (!left || !right) return <EmptyState>Player not found.</EmptyState>;

  const shared = await getPlayerSharedHistory(left.id, right.id);

  const fmtForm = (p: typeof left) =>
    p.form ? formatDecimal(p.form.rating) : "—";

  const rows: [string, string, string][] = [
    ["Team", left.team?.name ?? "Free agent", right.team?.name ?? "Free agent"],
    ["Role", left.role, right.role],
    ["Form rating (last 10)", fmtForm(left), fmtForm(right)],
    [
      "Career rating",
      left.career.maps ? formatDecimal(left.career.rating) : "—",
      right.career.maps ? formatDecimal(right.career.rating) : "—",
    ],
    [
      "Career ADR",
      left.career.maps ? formatDecimal(left.career.adr, 1) : "—",
      right.career.maps ? formatDecimal(right.career.adr, 1) : "—",
    ],
    [
      "Career K/D",
      left.career.deaths
        ? formatDecimal(left.career.kills / left.career.deaths)
        : "—",
      right.career.deaths
        ? formatDecimal(right.career.kills / right.career.deaths)
        : "—",
    ],
    ["Maps recorded", String(left.career.maps), String(right.career.maps)],
  ];

  return (
    <div className="space-y-6">
      <CompareTable leftName={left.nickname} rightName={right.nickname} rows={rows} />

      <Card title="Shared history">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Teams both played for
            </h3>
            {shared.sharedTeams.length ? (
              <ul className="space-y-1.5 text-sm">
                {shared.sharedTeams.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/cs2/teams/${t.slug}`} className="hover:text-accent">
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No shared teams on record.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Shared teammates
            </h3>
            {shared.sharedTeammates.length ? (
              <ul className="space-y-1.5 text-sm">
                {shared.sharedTeammates.map((p) => (
                  <li key={p.slug}>
                    <PlayerLink slug={p.slug} nickname={p.nickname} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No shared teammates on record.</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function fmtRank(rank: number | null): string {
  return rank ? `#${rank}` : "—";
}

function CompareTable({
  leftName,
  rightName,
  rows,
}: {
  leftName: string;
  rightName: string;
  rows: [string, string, string][];
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Metric</Th>
          <Th align="center">{leftName}</Th>
          <Th align="center">{rightName}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([metric, l, r]) => (
          <tr key={metric}>
            <Td>
              <span className="text-muted">{metric}</span>
            </Td>
            <Td align="center" mono>{l}</Td>
            <Td align="center" mono>{r}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
