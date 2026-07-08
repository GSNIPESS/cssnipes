import type { Metadata } from "next";
import { vetoLinesForMatches } from "@/analytics/projection";
import { EmptyState, PageTitle } from "@/components/ui";
import { MatchList } from "@/components/match-row";
import { getWeekSchedule } from "@/lib/queries/matches";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Schedule" };

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";
  const base = DAY_FMT.format(new Date(`${dateKey}T00:00:00Z`));
  return base;
}

export default async function SchedulePage() {
  const days = await getWeekSchedule(7);
  const todayKey = new Date().toISOString().slice(0, 10);

  // One bulk veto pass across the whole week, then split per day.
  const allMatches = days.flatMap((d) => d.matches);
  const vetoLines = await vetoLinesForMatches(prisma, allMatches);
  const total = allMatches.length;

  return (
    <>
      <PageTitle
        subtitle={`${total} match${total === 1 ? "" : "es"} across the next 7 days, with a predicted pick/ban for each. Days fill in as fixtures are announced and results land on each sync.`}
      >
        Schedule
      </PageTitle>

      {total === 0 ? (
        <EmptyState>
          No matches scheduled in the next 7 days. The data provider publishes
          fixtures as organizers announce them — check back after the next sync.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <section key={day.date} className="scroll-mt-24">
              <div className="mb-3 flex items-baseline justify-between border-b border-edge pb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-fg">
                  {dayLabel(day.date, todayKey)}
                </h2>
                <span className="font-mono text-xs text-muted">
                  {day.matches.length
                    ? `${day.matches.length} match${day.matches.length === 1 ? "" : "es"}`
                    : "—"}
                </span>
              </div>
              {day.matches.length ? (
                <MatchList matches={day.matches} vetoLines={vetoLines} />
              ) : (
                <p className="px-1 py-2 text-sm text-muted">
                  No fixtures announced for this day yet.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
