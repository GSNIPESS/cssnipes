import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState, PageTitle } from "@/components/ui";
import { MatchList } from "@/components/match-row";
import {
  getCompletedMatches,
  getLiveMatches,
  getUpcomingMatches,
} from "@/lib/queries/matches";

export const metadata: Metadata = { title: "Matches" };

const TABS = [
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === params.tab)
    ? (params.tab as TabKey)
    : "upcoming";

  const matches =
    tab === "live"
      ? await getLiveMatches(50)
      : tab === "upcoming"
        ? await getUpcomingMatches(50)
        : await getCompletedMatches(50);

  return (
    <>
      <PageTitle subtitle="Live, upcoming, and completed matches.">
        Matches
      </PageTitle>

      <div className="mb-6 flex gap-1 rounded-md border border-edge bg-surface p-1 text-sm w-fit">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/cs2/matches?tab=${t.key}`}
            className={`rounded px-4 py-1.5 font-medium transition-colors ${
              tab === t.key
                ? "bg-surface-2 text-fg"
                : "text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {matches.length ? (
        <MatchList matches={matches} />
      ) : (
        <EmptyState>No {tab} matches.</EmptyState>
      )}
    </>
  );
}
