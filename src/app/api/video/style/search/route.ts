import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchReferenceImages } from "@/lib/services/video-style-service";

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(req: NextRequest) {
  const queryResult = SearchQuerySchema.safeParse({
    q: req.nextUrl.searchParams.get("q"),
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: queryResult.error.message },
      { status: 400 },
    );
  }

  try {
    const items = await searchReferenceImages({
      query: queryResult.data.q,
      limit: queryResult.data.limit,
    });
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
