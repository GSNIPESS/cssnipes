"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-mono text-3xl font-bold text-loss">
        Something went wrong
      </div>
      <p className="mt-4 max-w-md text-sm text-muted">
        An unexpected error occurred while rendering this page.
        {error.digest && (
          <span className="mt-1 block font-mono text-xs">ref: {error.digest}</span>
        )}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:border-accent"
      >
        Try again
      </button>
    </div>
  );
}
