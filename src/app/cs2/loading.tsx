export default function Cs2Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading">
      <div className="h-8 w-64 rounded bg-surface-2" />
      <div className="h-4 w-96 max-w-full rounded bg-surface" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="h-40 rounded-lg border border-edge bg-surface" />
          <div className="h-40 rounded-lg border border-edge bg-surface" />
        </div>
        <div className="space-y-4">
          <div className="h-40 rounded-lg border border-edge bg-surface" />
          <div className="h-40 rounded-lg border border-edge bg-surface" />
        </div>
      </div>
    </div>
  );
}
