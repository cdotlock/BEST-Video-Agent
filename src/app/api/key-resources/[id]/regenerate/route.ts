import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { regenerate, getById } from "@/lib/services/key-resource-service";
import { pushMessages } from "@/lib/services/chat-session-service";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  prompt: z.string().min(1).optional(),
});

/** POST /api/key-resources/:id/regenerate */
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
    const before = await getById(id);
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await regenerate(id, parsed.data.prompt);

    const actionDesc = parsed.data.prompt
      ? `使用新 prompt 重新生成`
      : `使用原 prompt 重新生成`;
    await pushMessages(before.sessionId, [{
      role: "user",
      content: `[系统通知] 用户手动操作了资源 "${result.key}"：${actionDesc}。当前状态：prompt="${result.prompt}" url=${result.imageUrl} version=${result.version}`,
      hidden: true,
    }]);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
