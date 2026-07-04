export function ProbabilityBar({
  labelA,
  labelB,
  probA,
}: {
  labelA: string;
  labelB: string;
  probA: number;
}) {
  const pctA = Math.round(probA * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">
          {labelA} <span className="font-mono text-win">{pctA}%</span>
        </span>
        <span className="font-medium">
          <span className="font-mono text-muted">{100 - pctA}%</span> {labelB}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-surface-2">
        <div className="h-full bg-accent" style={{ width: `${pctA}%` }} />
      </div>
    </div>
  );
}
