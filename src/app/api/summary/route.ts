import { worldSummary } from "@/game/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await worldSummary();
    return Response.json({ ok: true, ...summary }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("summary error", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
