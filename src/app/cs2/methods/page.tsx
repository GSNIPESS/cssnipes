import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { SourceBadge } from "@/components/source-badge";
import { METRICS, PROVENANCE_LABELS } from "@/lib/provenance";

export const metadata: Metadata = { title: "Methods & data integrity" };

export default function MethodsPage() {
  return (
    <>
      <PageTitle subtitle="Where every number comes from: data classes, definitions, formulas, and how to read them.">
        Methods
      </PageTitle>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {(Object.keys(PROVENANCE_LABELS) as Array<keyof typeof PROVENANCE_LABELS>).map(
          (key) => (
            <Card key={key}>
              <div className="mb-2">
                <SourceBadge source={key} />
              </div>
              <p className="text-sm text-muted">
                {PROVENANCE_LABELS[key].description}
              </p>
            </Card>
          )
        )}
      </div>

      <div className="space-y-4">
        {METRICS.map((m) => (
          <Card
            key={m.name}
            title={m.name}
            action={<SourceBadge source={m.source} />}
          >
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Definition
                </dt>
                <dd>{m.definition}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Formula
                </dt>
                <dd className="font-mono text-xs">{m.formula}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Interpretation
                </dt>
                <dd className="text-muted">{m.interpretation}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted">
        Full derivations live in the repository: docs/ANALYTICS_FORMULAS.md and
        docs/PROVIDER_COVERAGE.md. Metrics that require data the current
        provider plan does not expose are locked with an explanation rather
        than estimated.
      </p>
    </>
  );
}
