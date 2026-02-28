import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listBySession } from "@/lib/services/image-generation-service";

const QuerySchema = z.object({
  sessionId: z.string().min(1),
});

/** GET /api/image-generations?sessionId=xxx */
export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse({
    sessionId: req.nextUrl.searchParams.get("sessionId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const rows = await listBySession(parsed.data.sessionId);
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
