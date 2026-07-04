import { handleApi, jsonOk, notFound } from "@/lib/api";
import { getEventBySlug } from "@/lib/queries/events";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handleApi(async () => {
    const { slug } = await params;
    const event = await getEventBySlug(slug);
    if (!event) return notFound("event");
    return jsonOk(event);
  });
}
