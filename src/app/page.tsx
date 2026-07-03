import Link from "next/link";

const SPORTS = [
  {
    href: "/cs2",
    label: "Counter-Strike 2",
    description:
      "Matches, players, teams, rankings, per-map statistics, and research analytics.",
    enabled: true,
  },
  {
    href: "/nhl",
    label: "NHL",
    description: "Hockey analytics — coming soon.",
    enabled: false,
  },
  {
    href: "/mlb",
    label: "MLB",
    description: "Baseball analytics — coming soon.",
    enabled: false,
  },
];

export default function HomePage() {
  return (
    <div className="py-12">
      <h1 className="text-3xl font-bold">
        Research-first esports &amp; sports analytics
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Historical statistics, ratings, and comparison tooling built on a
        normalized results database. Pick a sport to start exploring.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {SPORTS.map((sport) =>
          sport.enabled ? (
            <Link
              key={sport.href}
              href={sport.href}
              className="rounded-lg border border-edge bg-surface p-5 transition-colors hover:border-accent"
            >
              <div className="text-lg font-semibold text-accent">
                {sport.label}
              </div>
              <p className="mt-2 text-sm text-muted">{sport.description}</p>
            </Link>
          ) : (
            <div
              key={sport.href}
              className="rounded-lg border border-edge/50 bg-surface/50 p-5"
            >
              <div className="text-lg font-semibold text-muted">
                {sport.label}
              </div>
              <p className="mt-2 text-sm text-muted/70">{sport.description}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
