/**
 * VideoContextProvider — domain context for video workflow LLM sessions.
 *
 * Injects:
 *   1. novel_id / script_key
 *   2. init_workflow result (from novel_scripts.init_result)
 *   3. latest style_profile (from domain_resources category=style_profile)
 *
 * MCP tools still read/write source-of-truth data directly from DB.
 */

import type { ContextProvider } from "@/lib/agent/context-provider";
import {
  getInitResult,
  getEpisodeIdentityByScriptKey,
} from "@/lib/services/video-workflow-service";
import type { InitWorkflowResult } from "@/lib/services/video-workflow-service";
import { getStyleProfile } from "@/lib/services/video-style-service";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

export interface VideoContextConfig {
  novelId: string;
  scriptKey: string;
}

function buildStyleBlock(
  style: Awaited<ReturnType<typeof getStyleProfile>>,
): string | null {
  if (!style) {
    return null;
  }

  const lines: string[] = [
    "## Style Profile (latest)",
    `version: ${style.profile.version}`,
    `confirmed: ${style.profile.confirmed ? "yes" : "no"}`,
    `style_goal: ${style.profile.styleGoal}`,
    `reverse_prompt: ${style.profile.reversePrompt}`,
    `negative_prompt: ${style.profile.negativePrompt}`,
  ];

  if (style.profile.constraints.length > 0) {
    lines.push(`constraints: ${style.profile.constraints.join("; ")}`);
  }

  if (style.profile.referenceImages.length > 0) {
    lines.push("reference_images:");
    for (const ref of style.profile.referenceImages) {
      const title = ref.title ?? "untitled";
      lines.push(`- ${title}: ${ref.url}`);
    }
  }

  lines.push(
    "style_override_rule: If user explicitly requests a different style in this turn, follow user request and treat this profile as baseline only.",
  );

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export class VideoContextProvider implements ContextProvider {
  constructor(private readonly config: VideoContextConfig) {}

  async build(): Promise<string> {
    const { novelId, scriptKey } = this.config;

    const initResult: InitWorkflowResult | null = await getInitResult(
      novelId,
      scriptKey,
    );

    const lines: string[] = [
      "# Video Workflow Context",
      `novel_id: ${novelId}`,
      `script_key: ${scriptKey}`,
    ];

    if (initResult) {
      lines.push("");
      lines.push("## Init Workflow Result");
      lines.push(`script_id: ${initResult.scriptId}`);
      lines.push(`script_name: ${initResult.scriptName}`);
      lines.push(`next_step: ${initResult.nextStep}`);
      if (initResult.missingCharacters.length > 0) {
        lines.push(
          `missing_characters: ${initResult.missingCharacters.join(", ")}`,
        );
      }
    }

    const identity = await getEpisodeIdentityByScriptKey(novelId, scriptKey);
    const scriptId = initResult?.scriptId ?? identity?.id;

    if (scriptId) {
      const style = await getStyleProfile(scriptId);
      const styleBlock = buildStyleBlock(style);
      if (styleBlock) {
        lines.push("");
        lines.push(styleBlock);
      }
    }

    return lines.join("\n");
  }
}
