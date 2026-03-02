/**
 * VideoContextProvider — lightweight context for video workflow LLM sessions.
 *
 * Injects only:
 *   1. novel_id
 *   2. init_workflow result (from novel_scripts.init_result)
 *
 * All MCP tools read data directly from DB at execution time;
 * no need for heavyweight context injection.
 */

import type { ContextProvider } from "@/lib/agent/context-provider";
import { getInitResult } from "@/lib/services/video-workflow-service";
import type { InitWorkflowResult } from "@/lib/services/video-workflow-service";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

export interface VideoContextConfig {
  novelId: string;
  scriptKey: string;
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export class VideoContextProvider implements ContextProvider {
  constructor(private readonly config: VideoContextConfig) {}

  async build(): Promise<string> {
    const { novelId, scriptKey } = this.config;

    const initResult: InitWorkflowResult | null =
      await getInitResult(novelId, scriptKey);

    const lines: string[] = [
      "# Video Workflow Context",
      `novel_id: ${novelId}`,
    ];

    if (initResult) {
      lines.push("");
      lines.push("## Init Workflow Result");
      lines.push(`script_id: ${initResult.scriptId}`);
      lines.push(`script_key: ${initResult.scriptKey}`);
      lines.push(`script_name: ${initResult.scriptName}`);
      lines.push(`next_step: ${initResult.nextStep}`);
      if (initResult.missingCharacters.length > 0) {
        lines.push(`missing_characters: ${initResult.missingCharacters.join(", ")}`);
      }
    }

    return lines.join("\n");
  }
}
