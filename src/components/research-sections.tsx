import Link from "next/link";
import { Card, EmptyState, Table, Td, Th } from "@/components/ui";
import { formatDate, formatPercent } from "@/lib/format";
import type { Record_, ResearchSplits } from "@/lib/research";

/**
 * Shared research sections rendered on player and team profiles from a
 * ResearchSplits object. Every figure traces to completed matches in the
 * database; formulas in docs/ANALYTICS_FORMULAS.md.
 */

function rec(r: Record_): string {
  return r.played ? `${r.won}–${r.lost}` : "—";
}

function pct(r: Record_): string {
  return r.played ? formatPercent(r.won / r.played) : "—";
}

export function ResearchSplitsSections({
  splits,
  subject,
}: {
  splits: ResearchSplits;
  subject: "player" | "team";
}) {
  return (
    <>
      <Card title="Career splits by year">
        {splits.byYear.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Year</Th>
                <Th align="right">Record</Th>
                <Th align="right">Win rate</Th>
              </tr>
            </thead>
            <tbody>
              {splits.byYear.map((y) => (
                <tr key={y.year}>
                  <Td mono>{y.year}</Td>
                  <Td align="right" mono>{rec(y)}</Td>
                  <Td align="right" mono>
                    <span className={y.won / y.played >= 0.5 ? "text-win" : "text-loss"}>
                      {pct(y)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>No completed matches recorded.</EmptyState>
        )}
      </Card>

      <Card title="Records & environments">
        <Table>
          <thead>
            <tr>
              <Th>Split</Th>
              <Th align="right">Record</Th>
              <Th align="right">Win rate</Th>
            </tr>
          </thead>
          <tbody>
            <SplitRow label="LAN" r={splits.lan} />
            <SplitRow label="Online" r={splits.online} />
            {splits.byTier.map((t) => (
              <SplitRow key={t.tier} label={`Tier ${t.tier}`} r={t} />
            ))}
            <SplitRow label="vs Top 10 (Elo)" r={splits.vsTop10} />
            <SplitRow label="vs Top 25 (Elo)" r={splits.vsTop25} />
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted">
          Top-N is the opponent&apos;s position in the current internal Elo table.
          {subject === "player" &&
            " Player records are their teams' results (full history for the current team)."}
        </p>
      </Card>

      <Card title="Streaks & benchmarks">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Longest win streak" value={String(splits.longestWinStreak)} />
          <Metric label="Longest loss streak" value={String(splits.longestLossStreak)} />
          <Metric
            label="Current streak"
            value={
              splits.currentStreak
                ? `${splits.currentStreak.length}${splits.currentStreak.kind}`
                : "—"
            }
          />
          <Metric label="S-tier events" value={String(splits.majorAppearances)} />
          <Metric
            label="Strength of schedule"
            value={
              splits.strengthOfSchedule !== null
                ? String(Math.round(splits.strengthOfSchedule))
                : "—"
            }
            hint="mean opponent Elo, last 20"
          />
          <Metric
            label="Momentum"
            value={
              splits.momentum !== null
                ? `${splits.momentum >= 0 ? "+" : ""}${(splits.momentum * 100).toFixed(0)}pp`
                : "—"
            }
            hint="win% last 5 vs previous 5"
          />
          <Metric
            label="Volatility"
            value={splits.volatility !== null ? splits.volatility.toFixed(2) : "—"}
            hint="result stddev, last 20 (0–1)"
          />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Best wins (by opponent rank)
            </h3>
            {splits.bestWins.length ? (
              <ul className="space-y-1.5 text-sm">
                {splits.bestWins.map((m) => (
                  <li key={m.matchId} className="flex items-center justify-between gap-2">
                    <Link href={`/cs2/matches/${m.matchId}`} className="truncate hover:text-accent">
                      <span className="text-win">W</span> vs {m.opponent.name}
                      <span className="ml-1 font-mono text-xs text-muted">
                        #{m.opponent.rank}
                      </span>
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{formatDate(m.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No wins over rated opponents yet.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Worst losses (by opponent Elo)
            </h3>
            {splits.worstLosses.length ? (
              <ul className="space-y-1.5 text-sm">
                {splits.worstLosses.map((m) => (
                  <li key={m.matchId} className="flex items-center justify-between gap-2">
                    <Link href={`/cs2/matches/${m.matchId}`} className="truncate hover:text-accent">
                      <span className="text-loss">L</span> vs {m.opponent.name}
                      <span className="ml-1 font-mono text-xs text-muted">
                        {m.opponent.elo ? Math.round(m.opponent.elo) : ""}
                      </span>
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{formatDate(m.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No losses recorded.</p>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}

function SplitRow({ label, r }: { label: string; r: Record_ }) {
  return (
    <tr>
      <Td>
        <span className="text-muted">{label}</span>
      </Td>
      <Td align="right" mono>{rec(r)}</Td>
      <Td align="right" mono>
        {r.played ? (
          <span className={r.won / r.played >= 0.5 ? "text-win" : "text-loss"}>
            {pct(r)}
          </span>
        ) : (
          "—"
        )}
      </Td>
    </tr>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted">{hint}</div>}
    </div>
  );
}
