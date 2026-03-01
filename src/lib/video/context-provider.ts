/**
 * VideoContextProvider — structured context for video workflow LLM sessions.
 *
 * Generic: reads domain_resources + novel_scripts. No hardcoded business
 * categories (characters, costumes, scenes, shots).
 */

import type { ContextProvider } from "@/lib/agent/context-provider";
import { bizPool } from "@/lib/biz-db";
import { resolveTable, GLOBAL_USER } from "@/lib/biz-db-namespace";
import { getCurrentSessionId } from "@/lib/request-context";
import { buildResourceRegistryContext } from "@/lib/services/key-resource-context";
import { getResourcesByScope } from "@/lib/domain/resource-service";
import type { CategoryGroup, DomainResource } from "@/lib/domain/resource-service";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

export interface VideoContextConfig {
  novelId: string;
  novelName: string;
  scriptKey: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function physical(logicalName: string): Promise<string | null> {
  const resolved = await resolveTable(GLOBAL_USER, logicalName);
  return resolved?.physicalName ?? null;
}

interface ScriptRow {
  id: string;
  script_content: string | null;
}

async function queryScript(
  table: string, novelId: string, scriptKey: string,
): Promise<ScriptRow | null> {
  const { rows } = await bizPool.query(
    `SELECT id, script_content
     FROM "${table}"
     WHERE novel_id = $1 AND script_key = $2
     LIMIT 1`,
    [novelId, scriptKey],
  );
  return (rows[0] as ScriptRow | undefined) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Context assembly                                                   */
/* ------------------------------------------------------------------ */

function summarizeResource(r: DomainResource): string {
  const parts: string[] = [];
  if (r.title) parts.push(r.title);
  if (r.url) parts.push(`url=${r.url}`);
  if (r.mediaType === "json" && r.data) {
    const json = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    parts.push(`data=${json}`);
  }
  return parts.join(" | ");
}

function buildContext(
  config: VideoContextConfig,
  script: ScriptRow | null,
  novelCategories: CategoryGroup[],
  scriptCategories: CategoryGroup[],
): string {
  const L: string[] = [];
  const push = (s: string) => L.push(s);
  const allCategories = [...novelCategories, ...scriptCategories];

  /* ── 1. Identifiers ── */
  push("# Video Workflow Context");
  push(`novel_name: ${config.novelName}`);
  push(`novel_id: ${config.novelId}`);
  push(`script_key: ${config.scriptKey}`);
  push(`script_db_id: ${script?.id ?? "N/A"}`);

  /* ── 2. Script content ── */
  if (script?.script_content) {
    push("");
    push("## Script Content");
    push(script.script_content);
  }

  /* ── 3. Progress (per category) ── */
  push("");
  push("## Progress");
  push(`1. 剧本入库: ${script?.script_content ? "✅" : "0/1"}`);
  for (const g of allCategories) {
    const imageItems = g.items.filter((r) => r.mediaType === "image");
    const videoItems = g.items.filter((r) => r.mediaType === "video");
    if (imageItems.length > 0) {
      const withUrl = imageItems.filter((r) => r.url).length;
      push(`- ${g.category} (image): ${withUrl}/${imageItems.length}`);
    }
    if (videoItems.length > 0) {
      const withUrl = videoItems.filter((r) => r.url).length;
      push(`- ${g.category} (video): ${withUrl}/${videoItems.length}`);
    }
  }

  /* ── 4. Resources by category ── */
  for (const g of allCategories) {
    const nonJson = g.items.filter((r) => r.mediaType !== "json");
    if (nonJson.length === 0) continue;
    push("");
    push(`## ${g.category}`);
    for (const r of nonJson) {
      push(`- ${summarizeResource(r)}`);
    }
  }

  return L.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export class VideoContextProvider implements ContextProvider {
  constructor(private readonly config: VideoContextConfig) {}

  async build(): Promise<string> {
    const tScripts = await physical("novel_scripts");

    const script = tScripts
      ? await queryScript(tScripts, this.config.novelId, this.config.scriptKey)
      : null;
    const scriptId = script?.id;

    const [novelCategories, scriptCategories] = await Promise.all([
      getResourcesByScope("novel", this.config.novelId),
      scriptId ? getResourcesByScope("script", scriptId) : Promise.resolve([]),
    ]);

    let ctx = buildContext(this.config, script, novelCategories, scriptCategories);

    // Append Resource Registry if any tracked resources exist in this session
    const sessionId = getCurrentSessionId();
    if (sessionId) {
      const resourceRegistry = await buildResourceRegistryContext(sessionId);
      if (resourceRegistry) {
        ctx += "\n\n" + resourceRegistry;
      }
    }

    return ctx;
  }
}
