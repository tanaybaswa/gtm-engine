import type { NextRequest } from "next/server";
import { freshConsoleData, getConsoleData } from "@/lib/console/data";

// One topic's whole console. Served from the data cache unless the caller knows it changed.
export async function GET(request: NextRequest) {
  const topicId = Number(request.nextUrl.searchParams.get("topic"));
  if (!Number.isInteger(topicId) || topicId <= 0) return Response.json({ error: "topic is required" }, { status: 400 });
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const data = fresh ? await freshConsoleData(topicId) : await getConsoleData(topicId);
  if (!data) return Response.json({ error: "topic not found" }, { status: 404 });
  return Response.json(data, { headers: { "cache-control": "private, no-store" } });
}
