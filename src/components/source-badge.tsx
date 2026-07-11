import Link from "next/link";
import type { Provenance } from "@/lib/provenance";

const STYLES: Record<Provenance, string> = {
  OBSERVED: "text-win/80 border-win/25",
  MODEL: "text-accent/90 border-accent/25",
  INFERRED: "text-muted border-edge",
};

/**
 * Provenance badge — links to /cs2/methods so every labeled figure is one
 * click from its definition, formula, and interpretation.
 */
export function SourceBadge({ source }: { source: Provenance }) {
  return (
    <Link
      href="/cs2/methods"
      title="How this number is produced — see Methods"
      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest transition-colors hover:border-accent ${STYLES[source]}`}
    >
      {source}
    </Link>
  );
}
