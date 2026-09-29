import type { NextRequest } from "next/server";
import { freshTopicSummaries, getTopicSummaries } from "@/lib/console/data";

// Every topic with its counts and 14-day activity, for the topic rail.
export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const summaries = fresh ? await freshTopicSummaries() : await getTopicSummaries();
  return Response.json(summaries, { headers: { "cache-control": "private, no-store" } });
}
