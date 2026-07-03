import Link from "next/link";
import type { Metadata } from "next";
import { Badge, EmptyState, PageTitle, Table, Td, Th } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { getEvents } from "@/lib/queries/events";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const events = await getEvents();

  if (!events.length) {
    return (
      <>
        <PageTitle>Events</PageTitle>
        <EmptyState>No events in the database yet.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageTitle subtitle="Tournaments, most recent first.">Events</PageTitle>
      <Table>
        <thead>
          <tr>
            <Th>Event</Th>
            <Th>Tier</Th>
            <Th>Dates</Th>
            <Th>Location</Th>
            <Th align="right">Prize pool</Th>
            <Th align="right">Matches</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <Td>
                <Link
                  href={`/cs2/events/${e.slug}`}
                  className="font-medium hover:text-accent"
                >
                  {e.name}
                </Link>
              </Td>
              <Td>
                <Badge value={e.tier} />
              </Td>
              <Td>
                {formatDate(e.startDate)}
                {e.endDate ? ` – ${formatDate(e.endDate)}` : ""}
              </Td>
              <Td>{e.isLan ? e.location ?? "LAN" : "Online"}</Td>
              <Td align="right" mono>
                {e.prizePool ? formatMoney(e.prizePool) : "—"}
              </Td>
              <Td align="right" mono>{e._count.matches}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
