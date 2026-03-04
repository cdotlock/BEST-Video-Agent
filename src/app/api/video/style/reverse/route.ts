import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reversePromptFromReferences } from "@/lib/services/video-style-service";

const ReverseBodySchema = z.object({
  styleGoal: z.string().min(1),
  references: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().min(1).optional(),
      source: z.string().min(1).optional(),
      thumbnailUrl: z.string().url().optional(),
    }),
  ),
  constraints: z.array(z.string().min(1)).default([]),
});

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReverseBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const output = reversePromptFromReferences({
    styleGoal: parsed.data.styleGoal,
    references: parsed.data.references,
    constraints: parsed.data.constraints,
  });

  return NextResponse.json(output);
}
