import { NextRequest, NextResponse } from "next/server";
import { listBySession, listByMediaType } from "@/lib/services/key-resource-service";

/** GET /api/key-resources?sessionId=xxx[&mediaType=image] */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const mediaType = req.nextUrl.searchParams.get("mediaType");

  try {
    const rows = mediaType
      ? await listByMediaType(sessionId, mediaType)
      : await listBySession(sessionId);
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
