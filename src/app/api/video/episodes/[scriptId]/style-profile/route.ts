import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getStyleProfile,
  saveStyleProfile,
} from "@/lib/services/video-style-service";

const SaveStyleProfileSchema = z.object({
  styleGoal: z.string().min(1),
  referenceImages: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().min(1).optional(),
      source: z.string().min(1).optional(),
      thumbnailUrl: z.string().url().optional(),
    }),
  ),
  reversePrompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  constraints: z.array(z.string().min(1)).optional(),
  confirmed: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  const { scriptId } = await params;

  try {
    const styleProfile = await getStyleProfile(scriptId);
    return NextResponse.json({ styleProfile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  const { scriptId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SaveStyleProfileSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const styleProfile = await saveStyleProfile({
      scriptId,
      styleGoal: parsed.data.styleGoal,
      referenceImages: parsed.data.referenceImages,
      reversePrompt: parsed.data.reversePrompt,
      negativePrompt: parsed.data.negativePrompt,
      constraints: parsed.data.constraints,
      confirmed: parsed.data.confirmed,
    });

    return NextResponse.json(styleProfile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
