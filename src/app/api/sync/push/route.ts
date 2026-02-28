import { NextRequest, NextResponse } from "next/server";
import { SyncPushParams, pushToRemote } from "@/lib/services/sync-service";

/** POST /api/sync/push — push a local Skill or MCP to a remote instance */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const params = SyncPushParams.parse(body);
    const result = await pushToRemote(params);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
