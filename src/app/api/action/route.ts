import { dispatch } from "@/game/server";
import type { Action } from "@/game/types";

export const dynamic = "force-dynamic";

const ACTIONS = new Set([
  "move",
  "minestart",
  "minefinish",
  "build",
  "dismantle",
  "machineRecipe",
  "machineToggle",
  "machineLoad",
  "machineTake",
  "research",
  "decon",
  "reactor",
  "chat",
  "respawn",
  "scan",
  "moveItems",
]);

const validToken = (token: string) => /^[A-Za-z0-9._-]{8,80}$/.test(token);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, message: "Malformed intent" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!validToken(token)) {
    return Response.json({ ok: false, message: "Missing or invalid survivor token" }, { status: 400 });
  }
  const action = body.action;
  if (typeof action !== "string" || !ACTIONS.has(action)) {
    return Response.json({ ok: false, message: "Unknown intent" }, { status: 400 });
  }

  const { token: _token, name, ...rest } = body;
  void _token;
  try {
    const result = await dispatch(token, name, rest as Action);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("action error", action, error);
    return Response.json({ ok: false, message: "Server rejected the intent" }, { status: 500 });
  }
}
