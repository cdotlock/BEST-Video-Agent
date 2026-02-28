import { NextRequest, NextResponse } from "next/server";
import { getStoryboardVideos } from "@/lib/services/video-workflow-service";

/** GET /api/video/episodes/[scriptId]/storyboard — get video resources for storyboard */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  const { scriptId } = await params;
  try {
    const videos = await getStoryboardVideos(scriptId);
    return NextResponse.json(videos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
