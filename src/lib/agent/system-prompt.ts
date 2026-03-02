import { listSkills } from "@/lib/services/skill-service";
import { getSkill } from "@/lib/services/skill-service";
import { registry } from "@/lib/mcp/registry";

/* ------------------------------------------------------------------ */
/*  Static behavioural rules                                           */
/* ------------------------------------------------------------------ */

const RULES = `You are Agent Forge, an AI assistant with access to tools provided by MCP (Model Context Protocol) servers.

## Core Rules

### Skills
- Skills are system knowledge documents managed by the \`skills\` MCP.
- Always call \`skills__get\` to read full content **before** using related tools.
- Never create, update, or import skills unless the user explicitly asks.

### MCP Servers
MCP servers provide the tools you can call. Three types exist:

1. **Static** — Always loaded. Cannot be unloaded.
2. **Catalog** — Built-in but require env configuration. Load on-demand via \`mcp_manager__load\`. Check availability with \`mcp_manager__list_available\` first.
3. **Dynamic** — User-created JS code stored in DB. Read the \`dynamic-mcp-builder\` skill before creating or updating any Dynamic MCP.

**If a tool prefix is not in your current tool list, that MCP is not loaded — load it first, never guess.**

### Tool Call Memory
Previous tool results may be compressed: \`[memory] summary (recall:call_xxx)\`.
Use \`memory__recall\` only when the summary lacks detail you need.

### Error Handling
When a tool call fails, report the error to the user. Do not fabricate results.`;

/* ------------------------------------------------------------------ */
/*  System prompt: static rules + active MCP descriptions              */
/* ------------------------------------------------------------------ */

/**
 * Build the full system prompt.
 * Static rules + dynamic active MCP list (with skill index under the skills MCP).
 */
export async function buildSystemPrompt(preloadedSkills?: string[]): Promise<string> {
  const parts: string[] = [RULES];

  // Active MCP descriptions
  const mcpSection = await buildMcpSection(preloadedSkills);
  parts.push(mcpSection);

  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  Active MCP description builder                                     */
/* ------------------------------------------------------------------ */

async function buildMcpSection(preloadedSkills?: string[]): Promise<string> {
  const providers = registry.listProviders();
  const lines: string[] = ["## Active MCPs"];

  for (const provider of providers) {
    const tools = await provider.listTools();
    const toolNames = tools.map((t) => `\`${t.name}\``).join(", ");

    if (provider.name === "skills") {
      // Embed skill index under the skills MCP
      lines.push(`### \`skills\``);
      lines.push(`Tools: ${toolNames}`);
      await appendSkillIndex(lines, preloadedSkills);
    } else {
      lines.push(`### \`${provider.name}\``);
      lines.push(`Tools: ${toolNames}`);
    }
  }

  return lines.join("\n");
}

async function appendSkillIndex(lines: string[], preloadedSkills?: string[]): Promise<void> {
  const skills = await listSkills();
  if (skills.length === 0) return;

  lines.push("Available skills:");
  for (const s of skills) {
    const mcps = s.requiresMcps.length > 0 ? ` [needs: ${s.requiresMcps.map((m) => `\`${m}\``).join(", ")}]` : "";
    lines.push(`- **${s.name}**: ${s.description}${mcps}`);
  }

  // Append pre-loaded skill content inline
  if (preloadedSkills?.length) {
    const loaded: string[] = [];
    for (const name of preloadedSkills) {
      const skill = await getSkill(name);
      if (skill) loaded.push(`#### ${skill.name}\n${skill.content}`);
    }
    if (loaded.length > 0) {
      lines.push("");
      lines.push("Pre-loaded skill content (no need to call `skills__get`):");
      lines.push(loaded.join("\n\n"));
    }
  }
}
