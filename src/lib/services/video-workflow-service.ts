/**
 * Video Workflow Service — data access for the video UI.
 *
 * Uses domain_resources (generic) + novel_scripts (episode container).
 * No business concepts (characters, costumes, scenes, shots) in code.
 */

import { bizPool } from "@/lib/biz-db";
import { resolveTable, GLOBAL_USER } from "@/lib/biz-db-namespace";
import { ensureVideoSchema } from "@/lib/video/schema";
import { prisma } from "@/lib/db";
import {
  getResourcesByScope,
  deleteResourcesByScope,
  updateResourceData,
} from "@/lib/domain/resource-service";
import type {
  DomainResource,
  CategoryGroup,
  DomainResources,
} from "@/lib/domain/resource-service";

export type { DomainResource, CategoryGroup, DomainResources };

/* ------------------------------------------------------------------ */
/*  Helper: resolve physical table name                                */
/* ------------------------------------------------------------------ */

async function physical(logicalName: string): Promise<string> {
  await ensureVideoSchema();
  const resolved = await resolveTable(GLOBAL_USER, logicalName);
  if (!resolved) throw new Error(`Video table "${logicalName}" not found in BizTableMapping`);
  return resolved.physicalName;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type EpStatus = "empty" | "uploaded" | "has_resources";

export interface EpisodeSummary {
  id: string;
  novelId: string;
  scriptKey: string;
  scriptName: string | null;
  status: EpStatus;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Episodes                                                           */
/* ------------------------------------------------------------------ */

export async function listEpisodes(novelId: string): Promise<EpisodeSummary[]> {
  const tScripts = await physical("novel_scripts");

  const { rows: scripts } = await bizPool.query(
    `SELECT id, novel_id, script_key, script_name,
            script_content IS NOT NULL AS has_content,
            created_at
     FROM "${tScripts}"
     WHERE novel_id = $1
     ORDER BY script_key`,
    [novelId],
  );

  const episodes: EpisodeSummary[] = [];
  for (const row of scripts as Array<Record<string, unknown>>) {
    const scriptId = row.id as string;
    const hasContent = row.has_content as boolean;

    // Check if any domain_resources exist for this script
    let hasResources = false;
    if (hasContent) {
      const groups = await getResourcesByScope("script", scriptId);
      hasResources = groups.length > 0;
    }

    episodes.push({
      id: scriptId,
      novelId: row.novel_id as string,
      scriptKey: row.script_key as string,
      scriptName: row.script_name as string | null,
      status: !hasContent ? "empty" : hasResources ? "has_resources" : "uploaded",
      createdAt: String(row.created_at),
    });
  }

  return episodes;
}

export async function createEpisode(
  novelId: string,
  scriptKey: string,
  scriptName: string | null,
  scriptContent: string | null,
): Promise<{ id: string }> {
  const tScripts = await physical("novel_scripts");

  const { rows } = await bizPool.query(
    `INSERT INTO "${tScripts}" (novel_id, script_key, script_name, script_content)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [novelId, scriptKey, scriptName, scriptContent],
  );

  const row = rows[0] as { id: string } | undefined;
  if (!row) throw new Error("Failed to create episode");
  return row;
}

export async function deleteEpisode(scriptId: string): Promise<void> {
  const tScripts = await physical("novel_scripts");

  // Look up novel_id + script_key to derive session userName
  const { rows: scriptRows } = await bizPool.query(
    `SELECT novel_id, script_key FROM "${tScripts}" WHERE id = $1 LIMIT 1`,
    [scriptId],
  );
  const scriptRow = scriptRows[0] as { novel_id: string; script_key: string } | undefined;

  // Delete domain_resources for this script
  await deleteResourcesByScope("script", scriptId);

  // Delete the script itself
  await bizPool.query(`DELETE FROM "${tScripts}" WHERE id = $1`, [scriptId]);

  // Cascade-delete associated sessions (messages, tasks, events, key resources)
  if (scriptRow) {
    const userName = `video:${scriptRow.novel_id}:${scriptRow.script_key}`;
    const user = await prisma.user.findUnique({ where: { name: userName } });
    if (user) {
      await prisma.chatSession.deleteMany({ where: { userId: user.id } });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Resources                                                          */
/* ------------------------------------------------------------------ */

export async function getResources(
  scriptId: string,
  novelId: string,
): Promise<DomainResources> {
  // Get domain_resources for both scopes
  const [novelGroups, scriptGroups] = await Promise.all([
    getResourcesByScope("novel", novelId),
    getResourcesByScope("script", scriptId),
  ]);

  return { categories: [...novelGroups, ...scriptGroups] };
}

/* ------------------------------------------------------------------ */
/*  Resource mutations                                                 */
/* ------------------------------------------------------------------ */

/**
 * Update a domain resource's data field (for JSON editor).
 */
export { updateResourceData };

export async function getEpisodeContent(scriptId: string): Promise<string | null> {
  const tScripts = await physical("novel_scripts");
  const { rows } = await bizPool.query(
    `SELECT script_content FROM "${tScripts}" WHERE id = $1 LIMIT 1`,
    [scriptId],
  );
  const row = rows[0] as { script_content: string | null } | undefined;
  return row?.script_content ?? null;
}

export async function getEpisodeStatus(scriptId: string): Promise<EpStatus> {
  const tScripts = await physical("novel_scripts");

  const { rows: scriptRows } = await bizPool.query(
    `SELECT script_content IS NOT NULL AS has_content
     FROM "${tScripts}"
     WHERE id = $1`,
    [scriptId],
  );

  const script = scriptRows[0] as { has_content: boolean } | undefined;
  if (!script || !script.has_content) return "empty";

  const groups = await getResourcesByScope("script", scriptId);
  return groups.length > 0 ? "has_resources" : "uploaded";
}
