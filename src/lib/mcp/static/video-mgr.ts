import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { McpProvider } from "../types";
import { callFcGenerateImage } from "@/lib/services/fc-image-client";
import { getCurrentSessionId } from "@/lib/request-context";
import * as imageGenService from "@/lib/services/image-generation-service";

function text(t: string): CallToolResult {
  return { content: [{ type: "text", text: t }] };
}

function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function getFcVideoConfig() {
  const videoUrl = process.env.FC_GENERATE_VIDEO_URL;
  const videoToken = process.env.FC_GENERATE_VIDEO_TOKEN;
  return { videoUrl, videoToken };
}

const FcResultSchema = z.object({
  result: z.string().optional(),
  error: z.string().optional(),
});

const GenerateImageParams = z.object({
  items: z.array(
    z.object({
      key: z.string().min(1),
      prompt: z.string().min(1),
      referenceImageUrls: z.array(z.string().url()).optional(),
    }),
  ).min(1),
});

const GenerateVideoParams = z.object({
  items: z.array(
    z.object({
      imageUrl: z.string().url(),
      prompt: z.string().min(1),
    }),
  ).min(1),
});

export const videoMgrMcp: McpProvider = {
  name: "video_mgr",

  async listTools(): Promise<Tool[]> {
    return [
      {
        name: "generate_image",
        description:
          "Generate image(s) from text prompt(s) via FC, with lifecycle tracking. Each item requires a unique `key` (session-scoped) to identify the image across regenerations. Returns an array of results with status, imageUrl, key, and version.",
        inputSchema: {
          type: "object" as const,
          properties: {
            items: {
              type: "array",
              description: "Array of image generation tasks",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", description: "Unique semantic key for this image within the session (e.g. char_alice_portrait, scene_1_bg, shot_1_3). Re-using an existing key creates a new version." },
                  prompt: { type: "string", description: "Text prompt describing the image to generate" },
                  referenceImageUrls: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional reference image URLs for style/content guidance",
                  },
                },
                required: ["key", "prompt"],
              },
            },
          },
          required: ["items"],
        },
      },
      {
        name: "generate_video",
        description:
          "Generate video(s) from image(s) and motion prompt(s) concurrently (via FC). Returns an array of results with status (ok/error) and video URL. For a single video, pass a one-element array.",
        inputSchema: {
          type: "object" as const,
          properties: {
            items: {
              type: "array",
              description: "Array of video generation tasks",
              items: {
                type: "object",
                properties: {
                  imageUrl: { type: "string", description: "Source image URL to animate" },
                  prompt: { type: "string", description: "Text prompt describing the desired motion/animation" },
                },
                required: ["imageUrl", "prompt"],
              },
            },
          },
          required: ["items"],
        },
      },
    ];
  },

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    switch (name) {
      case "generate_image": {
        const sessionId = getCurrentSessionId();
        if (!sessionId) {
          return text("No session context — generate_image requires an active session.");
        }
        const { items } = GenerateImageParams.parse(args);
        const results = await Promise.allSettled(
          items.map(({ key, prompt, referenceImageUrls }) =>
            imageGenService.generateImage({
              sessionId,
              key,
              prompt,
              refUrls: referenceImageUrls,
            }),
          ),
        );
        const imgOutput = results.map((r, i) =>
          r.status === "fulfilled"
            ? { index: i, status: "ok" as const, key: r.value.key, imageUrl: r.value.imageUrl, version: r.value.version }
            : { index: i, status: "error" as const, key: items[i]!.key, error: r.reason instanceof Error ? r.reason.message : String(r.reason) },
        );
        return json(imgOutput);
      }

      case "generate_video": {
        const fc = getFcVideoConfig();
        if (!fc.videoUrl || !fc.videoToken) {
          return text("未配置 FC 视频生成服务 (FC_GENERATE_VIDEO_URL, FC_GENERATE_VIDEO_TOKEN)");
        }
        const { items } = GenerateVideoParams.parse(args);
        const results = await Promise.allSettled(
          items.map(async ({ imageUrl, prompt }) => {
            const res = await fetch(fc.videoUrl!, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${fc.videoToken}`,
              },
              body: JSON.stringify({ action: "generate", imageUrl, prompt }),
            });
            const data: unknown = await res.json();
            const parsed = FcResultSchema.parse(data);
            if (!res.ok || parsed.error) throw new Error(parsed.error ?? res.statusText);
            if (!parsed.result) throw new Error("FC returned no result");
            return parsed.result;
          }),
        );
        const vidOutput = results.map((r, i) =>
          r.status === "fulfilled"
            ? { index: i, status: "ok" as const, videoUrl: r.value }
            : { index: i, status: "error" as const, error: r.reason instanceof Error ? r.reason.message : String(r.reason) },
        );
        return json(vidOutput);
      }

      default:
        return text(`Unknown tool: ${name}`);
    }
  },
};
