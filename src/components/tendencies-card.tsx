import { Card, EmptyState, Table, Td, Th } from "@/components/ui";
import { SourceBadge } from "@/components/source-badge";
import { formatPercent } from "@/lib/format";
import type { Record_, Tendencies } from "@/lib/research";

/**
 * Situational tendencies vs the team's own baseline: each split shows its
 * record, win rate, and the delta against the overall win rate, with sample
 * sizes so small splits read cautiously.
 */
export function TendenciesCard({ tendencies }: { tendencies: Tendencies }) {
  const base = tendencies.baseline;
  if (base.played < 10) {
    return (
      <Card title="Situational tendencies" action={<SourceBadge source="MODEL" />}>
        <EmptyState>
          Needs at least 10 completed matches to compute meaningful splits —
          this team has {base.played} on record.
        </EmptyState>
      </Card>
    );
  }
  const baseRate = base.won / base.played;

  const rows: Array<{ label: string; r: Record_ }> = [
    { label: "After a win", r: tendencies.afterWin },
    { label: "After a loss", r: tendencies.afterLoss },
    { label: "vs stronger opponents (Elo)", r: tendencies.vsStronger },
    { label: "vs weaker opponents (Elo)", r: tendencies.vsWeaker },
    { label: "Short rest (≤2 days)", r: tendencies.shortRest },
    { label: "Normal rest (3–7 days)", r: tendencies.normalRest },
    { label: "Long break (>7 days)", r: tendencies.longRest },
  ];

  return (
    <Card
      title="Situational tendencies"
      action={<SourceBadge source="MODEL" />}
    >
      <Table>
        <thead>
          <tr>
            <Th>Situation</Th>
            <Th align="right">Record</Th>
            <Th align="right">Win rate</Th>
            <Th align="right">vs baseline</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>
              <span className="font-medium">Baseline (all matches)</span>
            </Td>
            <Td align="right" mono>
              {base.won}–{base.lost}
            </Td>
            <Td align="right" mono>{formatPercent(baseRate)}</Td>
            <Td align="right" mono>—</Td>
          </tr>
          {rows
            .filter(({ r }) => r.played > 0)
            .map(({ label, r }) => {
              const rate = r.won / r.played;
              const delta = rate - baseRate;
              return (
                <tr key={label}>
                  <Td>
                    <span className="text-muted">{label}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted">
                      n={r.played}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {r.won}–{r.lost}
                  </Td>
                  <Td align="right" mono>{formatPercent(rate)}</Td>
                  <Td align="right" mono>
                    <span
                      className={
                        Math.abs(delta) < 0.03
                          ? "text-muted"
                          : delta > 0
                            ? "text-win"
                            : "text-loss"
                      }
                    >
                      {delta >= 0 ? "+" : ""}
                      {Math.round(delta * 100)}pp
                    </span>
                  </Td>
                </tr>
              );
            })}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-muted">
        Splits of completed results by situation; &quot;stronger/weaker&quot;
        uses the opponent&apos;s current Elo vs this team&apos;s. Read small
        samples (n) cautiously. Formulas in Methods.
      </p>
    </Card>
  );
}
