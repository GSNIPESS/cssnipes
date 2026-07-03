import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-mono text-5xl font-bold text-accent">404</div>
      <p className="mt-4 text-muted">
        That page doesn&apos;t exist or the record was removed.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:border-accent"
      >
        Back to home
      </Link>
    </div>
  );
}
