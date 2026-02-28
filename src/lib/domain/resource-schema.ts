/**
 * Domain Resources — single generic resource table.
 *
 * Replaces all per-category biz-db tables (novel_characters, script_costumes,
 * script_scenes, script_shots, etc.) with one unified table.
 *
 * Categories are data, not code — LLM decides the category at creation time.
 * Code only cares about media_type (image / video / json) for rendering.
 */

import { bizPool, bizDbReady } from "@/lib/biz-db";
import {
  resolveTable,
  ensureMapping,
  GLOBAL_USER,
} from "@/lib/biz-db-namespace";

/* ------------------------------------------------------------------ */
/*  DDL                                                                */
/* ------------------------------------------------------------------ */

const LOGICAL_NAME = "domain_resources";

const DDL = `CREATE TABLE IF NOT EXISTS "$TABLE" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  category TEXT NOT NULL,
  media_type TEXT NOT NULL,
  title TEXT,
  url TEXT,
  data JSONB,
  image_gen_id TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`;

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_$SHORT_scope ON "$TABLE" (scope_type, scope_id)`,
  `CREATE INDEX IF NOT EXISTS idx_$SHORT_category ON "$TABLE" (scope_id, category)`,
];

/* ------------------------------------------------------------------ */
/*  Ensure table exists                                                */
/* ------------------------------------------------------------------ */

let ensured = false;

/**
 * Ensure the domain_resources table exists in biz-db with a _global_ mapping.
 * Safe to call multiple times — only runs once.
 */
export async function ensureDomainResourcesTable(): Promise<void> {
  if (ensured) return;
  ensured = true;

  await bizDbReady;

  let physicalName: string;
  const existing = await resolveTable(GLOBAL_USER, LOGICAL_NAME);
  if (existing) {
    physicalName = existing.physicalName;
    await bizPool.query(DDL.replace("$TABLE", physicalName));
  } else {
    physicalName = await ensureMapping(GLOBAL_USER, LOGICAL_NAME);
    await bizPool.query(DDL.replace("$TABLE", physicalName));
    console.log(
      `[domain-resources] Created table "${LOGICAL_NAME}" → "${physicalName}"`,
    );
  }

  // Create indexes
  const short = physicalName.replace(/^t_/, "");
  for (const idx of INDEXES) {
    await bizPool.query(
      idx.replaceAll("$TABLE", physicalName).replaceAll("$SHORT", short),
    );
  }
}

export { LOGICAL_NAME as DOMAIN_RESOURCES_TABLE };
