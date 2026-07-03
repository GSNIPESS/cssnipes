import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export type MatchRowData = {
  id: string;
  status: string;
  bestOf: number;
  stage: string | null;
  scheduledAt: Date;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  teamAId: string;
  teamBId: string;
  teamA: { slug: string; name: string };
  teamB: { slug: string; name: string };
  event: { slug: string; name: string };
};

function TeamScore({
  name,
  score,
  won,
  completed,
}: {
  name: string;
  score: number;
  won: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={completed && !won ? "text-muted" : "font-medium"}>
        {name}
      </span>
      {completed && (
        <span
          className={`font-mono text-sm tabular-nums ${
            won ? "text-win" : "text-muted"
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

export function MatchRow({ match }: { match: MatchRowData }) {
  const completed = match.status === "COMPLETED";
  return (
    <Link
      href={`/cs2/matches/${match.id}`}
      className="block rounded-md border border-edge bg-surface px-4 py-3 transition-colors hover:border-accent-dim"
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <TeamScore
            name={match.teamA.name}
            score={match.scoreA}
            won={match.winnerId === match.teamAId}
            completed={completed}
          />
          <TeamScore
            name={match.teamB.name}
            score={match.scoreB}
            won={match.winnerId === match.teamBId}
            completed={completed}
          />
        </div>
        <div className="w-44 shrink-0 space-y-1 text-right text-xs text-muted">
          <div>
            <Badge value={match.status} />{" "}
            <span className="font-mono">BO{match.bestOf}</span>
          </div>
          <div className="truncate">{match.event.name}</div>
          <div>{match.stage ? `${match.stage} · ` : ""}{formatDateTime(match.scheduledAt)}</div>
        </div>
      </div>
    </Link>
  );
}

export function MatchList({ matches }: { matches: MatchRowData[] }) {
  return (
    <div className="space-y-2">
      {matches.map((m) => (
        <MatchRow key={m.id} match={m} />
      ))}
    </div>
  );
}
