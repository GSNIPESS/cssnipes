import { Cs2Nav } from "@/components/cs2-nav";

// CS2 pages render live database state on every request.
export const dynamic = "force-dynamic";

export default function Cs2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Cs2Nav />
      {children}
    </>
  );
}
