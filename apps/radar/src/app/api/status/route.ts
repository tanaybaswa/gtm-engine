import { liveStatus } from "@/lib/console/data";

export const dynamic = "force-dynamic";

// Polled by open consoles: which runs are going, and when data last changed.
export async function GET() {
  return Response.json(await liveStatus(), { headers: { "cache-control": "private, no-store" } });
}
