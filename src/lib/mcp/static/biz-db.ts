import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { McpProvider } from "../types";
import { bizPool } from "@/lib/biz-db";
import { guardQuery, guardExecute } from "@/lib/sql-guard";
import { getCurrentUserName } from "@/lib/request-context";
import {
  listVisibleTables,
  resolveTable,
  buildRewriteMap,
  applySqlRewrite,
  upgradeToGlobal,
  findRelatedTables,
  extractDroppedTableNames,
  deleteMappings,
  GLOBAL_USER,
} from "@/lib/biz-db-namespace";

function text(t: string): CallToolResult {
  return { content: [{ type: "text", text: t }] };
}

function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export const bizDbMcp: McpProvider = {
  name: "biz_db",

  async listTools(): Promise<Tool[]> {
    return [
      {
        name: "list_tables",
        description:
          "List all tables in the business database (PostgreSQL). Shows your tables and global tables.",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "describe_table",
        description:
          "Show the column names and data types of table(s). Pass an array of table names. For a single table, pass a one-element array.",
        inputSchema: {
          type: "object" as const,
          properties: {
            tables: {
              type: "array",
              items: { type: "string" },
              description: "Array of table names to describe",
            },
          },
          required: ["tables"],
        },
      },
      {
        name: "sql",
        description:
          "Run any SQL on the business PostgreSQL database. " +
          "Reads (SELECT / WITH) return JSON rows. " +
          "Writes (INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE, TRUNCATE) return affected row count.",
        inputSchema: {
          type: "object" as const,
          properties: {
            sql: {
              type: "string",
              description: "SQL statement",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "upgrade_global",
        description:
          "Upgrade a user-scoped table to a global table visible to all users. This is irreversible. " +
          "If related tables are detected (from API definitions), they will be listed for confirmation before proceeding.",
        inputSchema: {
          type: "object" as const,
          properties: {
            table: {
              type: "string",
              description: "Logical table name to upgrade",
            },
            confirm: {
              type: "boolean",
              description: "Set to true to confirm upgrade (including related tables). First call without confirm to see related tables.",
            },
            include_related: {
              type: "array",
              items: { type: "string" },
              description: "Related table names to also upgrade (from the list returned by the first call)",
            },
          },
          required: ["table"],
        },
      },
      {
        name: "list_global_tables",
        description: "List all global tables (not scoped to any user).",
        inputSchema: { type: "object" as const, properties: {} },
      },
    ];
  },

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const userName = getCurrentUserName();

    switch (name) {
      case "list_tables": {
        const visible = await listVisibleTables(userName);
        if (visible.length === 0) return text("No tables in business database.");
        return json(visible);
      }

      case "describe_table": {
        const tableNames = args.tables as string[];
        if (!Array.isArray(tableNames) || tableNames.length === 0) return text("Missing tables parameter.");

        const describeOne = async (logicalName: string) => {
          const resolved = await resolveTable(userName, logicalName);
          if (!resolved) return { table: logicalName, error: "not found" };
          const colResult = await bizPool.query(
            `SELECT column_name, data_type, is_nullable
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1
             ORDER BY ordinal_position`,
            [resolved.physicalName],
          );
          if (colResult.rows.length === 0) return { table: logicalName, error: "not found" };
          return { table: logicalName, columns: colResult.rows };
        };

        if (tableNames.length === 1) {
          const result = await describeOne(tableNames[0]!);
          if ("error" in result) return text(`Table "${tableNames[0]}" not found.`);
          return json(result);
        }

        const results = await Promise.all(tableNames.map(describeOne));
        return json(results);
      }

      case "sql": {
        const sql = String(args.sql);
        const normalized = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim().toUpperCase();
        const isRead = normalized.startsWith("SELECT") || normalized.startsWith("WITH");

        if (isRead) {
          console.log("[biz_db sql/read] input:", sql);
          const check = guardQuery(sql);
          if (!check.ok) return text(check.reason);

          const map = await buildRewriteMap(userName, sql, false);
          const rewritten = applySqlRewrite(sql, map);
          console.log("[biz_db sql/read] rewritten:", rewritten);
          const result = await bizPool.query(rewritten);
          return json({ rows: result.rows, rowCount: result.rowCount });
        } else {
          console.log("[biz_db sql/write] input:", sql);
          const check = guardExecute(sql);
          if (!check.ok) return text(check.reason);

          const map = await buildRewriteMap(userName, sql, true);
          const rewritten = applySqlRewrite(sql, map);
          console.log("[biz_db sql/write] final SQL:", rewritten);
          const result = await bizPool.query(rewritten);

          const dropped = extractDroppedTableNames(sql);
          if (dropped.length > 0) {
            await deleteMappings(userName, dropped);
          }

          // Return JSON so sandbox callToolSync can reliably parse the result.
          // If the query includes a RETURNING clause, include the returned rows.
          if (result.rows && result.rows.length > 0) {
            return json({ rows: result.rows, rowCount: result.rowCount ?? 0, command: result.command });
          }
          return json({ ok: true, rowCount: result.rowCount ?? 0, command: result.command });
        }
      }

      case "upgrade_global": {
        if (!userName) return text("Cannot upgrade: no user context.");

        const logicalName = String(args.table);
        const confirm = args.confirm === true;
        const includeRelated = Array.isArray(args.include_related)
          ? (args.include_related as string[])
          : [];

        const resolved = await resolveTable(userName, logicalName);
        if (!resolved || resolved.owner !== userName) {
          return text(`User table "${logicalName}" not found.`);
        }
        if (resolved.owner === GLOBAL_USER) {
          return text(`"${logicalName}" is already a global table.`);
        }

        // First call: detect related tables and ask for confirmation
        if (!confirm) {
          const related = await findRelatedTables(userName, logicalName);
          return json({
            action: "upgrade_global",
            table: logicalName,
            related_tables: related,
            message: related.length > 0
              ? `Found related user tables: ${related.join(", ")}. Call again with confirm=true and optionally include_related=[...] to also upgrade them. This is IRREVERSIBLE.`
              : `No related tables found. Call again with confirm=true to proceed. This is IRREVERSIBLE.`,
          });
        }

        // Confirmed: upgrade ownership (no data copy needed)
        const tables = [logicalName, ...includeRelated];
        const results: string[] = [];

        for (const t of tables) {
          const upgraded = await upgradeToGlobal(userName, t);
          if (upgraded) {
            results.push(`OK "${t}": upgraded to global`);
          } else {
            results.push(`SKIP "${t}": user table not found`);
          }
        }

        return text(`Upgrade complete:\n${results.join("\n")}`);
      }

      case "list_global_tables": {
        const visible = await listVisibleTables(undefined);
        return json(visible);
      }

      default:
        return text(`Unknown tool: ${name}`);
    }
  },
};
