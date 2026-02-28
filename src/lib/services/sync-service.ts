import { z } from "zod";
import * as skillService from "./skill-service";
import * as mcpService from "./mcp-service";

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

export const SyncPushParams = z.object({
  type: z.enum(["skill", "mcp"]),
  name: z.string().min(1),
  targetUrl: z.string().url(),
});

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SyncPushResult {
  action: "created" | "updated";
  type: "skill" | "mcp";
  name: string;
  targetUrl: string;
}

/* ------------------------------------------------------------------ */
/*  Push to remote                                                    */
/* ------------------------------------------------------------------ */

export async function pushToRemote(
  params: z.infer<typeof SyncPushParams>,
): Promise<SyncPushResult> {
  const { type, name, targetUrl } = params;
  const base = targetUrl.replace(/\/+$/, "");

  if (type === "skill") {
    return pushSkill(name, base);
  }
  return pushMcp(name, base);
}

/* ------------------------------------------------------------------ */
/*  Skill push                                                        */
/* ------------------------------------------------------------------ */

async function pushSkill(name: string, base: string): Promise<SyncPushResult> {
  const local = await skillService.getSkill(name);
  if (!local) throw new Error(`Local skill "${name}" not found`);

  const exists = await remoteExists(`${base}/api/skills/${encodeURIComponent(name)}`);

  if (exists) {
    const res = await fetch(`${base}/api/skills/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: local.description,
        content: local.content,
        tags: local.tags,
        metadata: local.metadata,
        promote: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Remote PUT /api/skills/${name} failed (${res.status}): ${body}`);
    }
    return { action: "updated", type: "skill", name, targetUrl: base };
  }

  const res = await fetch(`${base}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description: local.description,
      content: local.content,
      tags: local.tags,
      metadata: local.metadata,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Remote POST /api/skills failed (${res.status}): ${body}`);
  }
  return { action: "created", type: "skill", name, targetUrl: base };
}

/* ------------------------------------------------------------------ */
/*  MCP push                                                          */
/* ------------------------------------------------------------------ */

async function pushMcp(name: string, base: string): Promise<SyncPushResult> {
  const local = await mcpService.getMcpServer(name);
  if (!local) throw new Error(`Local MCP server "${name}" not found`);

  const exists = await remoteExists(`${base}/api/mcps/${encodeURIComponent(name)}`);

  if (exists) {
    const res = await fetch(`${base}/api/mcps/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: local.code,
        description: local.description,
        promote: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Remote PUT /api/mcps/${name} failed (${res.status}): ${body}`);
    }
    return { action: "updated", type: "mcp", name, targetUrl: base };
  }

  const res = await fetch(`${base}/api/mcps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description: local.description,
      code: local.code,
      enabled: local.enabled,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Remote POST /api/mcps failed (${res.status}): ${body}`);
  }
  return { action: "created", type: "mcp", name, targetUrl: base };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function remoteExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
