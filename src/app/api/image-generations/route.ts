import { NextRequest, NextResponse } from "next/server";
import { listBySession, listAll } from "@/lib/services/image-generation-service";

/** GET /api/image-generations?sessionId=xxx (optional — omit for all) */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  try {
    const rows = sessionId ? await listBySession(sessionId) : await listAll();
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
