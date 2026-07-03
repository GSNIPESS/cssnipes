import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { MatchList } from "@/components/match-row";
import { formatDate, formatMoney } from "@/lib/format";
import { getEventBySlug } from "@/lib/queries/events";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <>
      <PageTitle
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge value={event.tier} />
            <span>
              {formatDate(event.startDate)}
              {event.endDate ? ` – ${formatDate(event.endDate)}` : ""}
            </span>
            <span>· {event.isLan ? event.location ?? "LAN" : "Online"}</span>
            {event.prizePool && <span>· {formatMoney(event.prizePool)}</span>}
          </span>
        }
      >
        {event.name}
      </PageTitle>

      <Card title={`Matches (${event.matches.length})`}>
        {event.matches.length ? (
          <MatchList matches={event.matches} />
        ) : (
          <EmptyState>No matches scheduled yet.</EmptyState>
        )}
      </Card>
    </>
  );
}
