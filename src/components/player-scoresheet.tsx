import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import type { MatchPlayerProps, TeamProps } from "@/lib/queries/player-props";

/**
 * Scoresheet-style projection graph: per rostered player, projected kills and
 * headshots for maps 1–2, with a bar sized to the value and its 80% interval.
 * Renders a single explanatory panel when no player has map-level history.
 */
export function PlayerScoresheet({ props }: { props: MatchPlayerProps }) {
  if (!props.teams) {
    return (
      <Card title="Player projections — maps 1–2">
        <EmptyState>{props.reason}</EmptyState>
      </Card>
    );
  }

  const scopeLabel = props.propsMaps === 1 ? "map 1" : "maps 1–2";

  if (!props.available) {
    return (
      <Card title={`Player kills & headshots — ${scopeLabel}`}>
        <EmptyState>{props.reason}</EmptyState>
      </Card>
    );
  }

  // Shared kill scale across both rosters for comparable bar widths.
  const maxKills = Math.max(
    1,
    ...props.teams.flatMap((t) =>
      t.players.map((p) => (p.projection ? p.projection.kills.high : 0))
    )
  );

  return (
    <Card
      title={`Player kills & headshots — ${scopeLabel} (projected)`}
      action={
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          20k sims · Bo{props.bestOf}
        </span>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {props.teams.map((team) => (
          <TeamScoresheet key={team.slug} team={team} maxKills={maxKills} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">
        Expected kills/headshots over {`${scopeLabel} `}from each player&apos;s
        last 10 recorded matches on those maps, opponent-adjusted and simulated
        20,000×. Bars show the projected total; the range is the 80% prediction
        interval. Research projection from stored results only — not betting
        advice.
      </p>
    </Card>
  );
}

function TeamScoresheet({ team, maxKills }: { team: TeamProps; maxKills: number }) {
  return (
    <div>
      <h3 className="mb-3 flex items-center justify-between text-sm font-semibold">
        <Link href={`/cs2/teams/${team.slug}`} className="hover:text-accent">
          {team.name}
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          K · HS
        </span>
      </h3>
      <ul className="space-y-2.5">
        {team.players.map((p) => (
          <li key={p.slug}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <Link href={`/cs2/players/${p.slug}`} className="font-medium hover:text-accent">
                {p.nickname}
              </Link>
              {p.projection ? (
                <span className="font-mono tabular-nums">
                  <span className="text-fg">{p.projection.kills.expected}</span>
                  <span className="text-muted"> · </span>
                  <span className="text-accent">{p.projection.headshots.expected}</span>
                </span>
              ) : (
                <span className="font-mono text-xs text-muted">no data</span>
              )}
            </div>
            {p.projection ? (
              <div className="relative h-2.5 overflow-hidden rounded bg-surface-2">
                {/* 80% interval track */}
                <span
                  className="absolute inset-y-0 rounded bg-edge"
                  style={{
                    left: `${(p.projection.kills.low / maxKills) * 100}%`,
                    width: `${((p.projection.kills.high - p.projection.kills.low) / maxKills) * 100}%`,
                  }}
                />
                {/* expected kills bar */}
                <span
                  className="absolute inset-y-0 left-0 rounded bg-accent/70"
                  style={{ width: `${(p.projection.meanKills / maxKills) * 100}%` }}
                />
                {/* headshot marker */}
                <span
                  className="absolute inset-y-0 w-0.5 bg-fg"
                  style={{ left: `${(p.projection.headshots.expected / maxKills) * 100}%` }}
                  title="projected headshots"
                />
              </div>
            ) : (
              <div className="h-2.5 rounded bg-surface-2/50" />
            )}
            {p.projection && (
              <div className="mt-0.5 text-[10px] text-muted">
                K {p.projection.kills.low}–{p.projection.kills.high} · HS{" "}
                {p.projection.headshots.low}–{p.projection.headshots.high} ·{" "}
                {Math.round(p.projection.hsPercent * 100)}% HS · {p.projection.sampleSize} matches
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
