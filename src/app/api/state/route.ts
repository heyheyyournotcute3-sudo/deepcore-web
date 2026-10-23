import { getState } from "@/game/server";

export const dynamic = "force-dynamic";

const validToken = (token: string) => /^[A-Za-z0-9._-]{8,80}$/.test(token);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!validToken(token)) {
    return Response.json({ ok: false, message: "Missing or invalid survivor token" }, { status: 400 });
  }
  const sinceRaw = Number(url.searchParams.get("since") ?? "0");
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0;
  const name = url.searchParams.get("name") ?? undefined;
  try {
    const state = await getState(token, since, name);
    return Response.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("state error", error);
    return Response.json({ ok: false, message: "Shaft telemetry unavailable" }, { status: 500 });
  }
}
