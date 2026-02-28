import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { regenerate, getById } from "@/lib/services/image-generation-service";
import { pushMessages } from "@/lib/services/chat-session-service";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  prompt: z.string().min(1).optional(),
});

/** POST /api/image-generations/:id/regenerate */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    // Need sessionId for append log — fetch before regeneration
    const before = await getById(id);
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await regenerate(id, parsed.data.prompt);

    // Append log to session so LLM knows about the out-of-band operation
    const actionDesc = parsed.data.prompt
      ? `使用新 prompt 重新生成`
      : `使用原 prompt 重新生成`;
    await pushMessages(before.sessionId, [{
      role: "user",
      content: `[系统通知] 用户手动操作了图片 "${result.key}"：${actionDesc}。当前状态：prompt="${result.prompt}" url=${result.imageUrl} version=${result.version}`,
    }]);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
