import { z } from "zod";
import {
  createResource,
  getResourcesByScope,
  updateResourceData,
} from "@/lib/domain/resource-service";

const STYLE_PROFILE_CATEGORY = "style_profile";
const STYLE_PROFILE_MEDIA_TYPE = "json";

const StyleReferenceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  thumbnailUrl: z.string().url().optional(),
});

const StyleProfileSchema = z.object({
  styleGoal: z.string().min(1),
  referenceImages: z.array(StyleReferenceSchema),
  reversePrompt: z.string().min(1),
  negativePrompt: z.string().default(""),
  constraints: z.array(z.string().min(1)).default([]),
  confirmed: z.boolean().default(false),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});

export type StyleReference = z.infer<typeof StyleReferenceSchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

const WikimediaSearchResponseSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          fullurl: z.string().url().optional(),
          thumbnail: z
            .object({
              source: z.string().url(),
            })
            .optional(),
        }),
      ),
    })
    .optional(),
});

export interface SearchReferenceInput {
  query: string;
  limit: number;
}

export interface ReversePromptInput {
  styleGoal: string;
  references: StyleReference[];
  constraints: string[];
}

function extractStyleProfileFromScope(
  resources: Awaited<ReturnType<typeof getResourcesByScope>>,
): {
  resourceId: string;
  profile: StyleProfile;
} | null {
  const group = resources.find(
    (item) => item.category === STYLE_PROFILE_CATEGORY,
  );
  if (!group || group.items.length === 0) {
    return null;
  }

  const latest = group.items[group.items.length - 1];
  if (!latest) {
    return null;
  }

  const parsed = StyleProfileSchema.safeParse(latest.data);
  if (!parsed.success) {
    return null;
  }

  return {
    resourceId: latest.id,
    profile: parsed.data,
  };
}

export async function searchReferenceImages(
  input: SearchReferenceInput,
): Promise<StyleReference[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: input.query,
    gsrlimit: String(input.limit),
    prop: "pageimages|info",
    inprop: "url",
    pithumbsize: "640",
    origin: "*",
  });

  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Wikimedia search failed with status ${res.status}`);
  }

  const raw: unknown = await res.json();
  const parsed = WikimediaSearchResponseSchema.parse(raw);
  const pages = parsed.query?.pages ?? [];

  const mapped: Array<StyleReference | null> = pages.map((p) => {
    const imageUrl = p.fullurl ?? p.thumbnail?.source;
    if (!imageUrl) {
      return null;
    }
    const item: StyleReference = {
      url: imageUrl,
      thumbnailUrl: p.thumbnail?.source,
      title: p.title,
      source: "wikimedia-commons",
    };
    return item;
  });

  return mapped.filter((item): item is StyleReference => item !== null);
}

function inferKeywordFragment(references: StyleReference[]): string {
  const titles = references
    .map((item) => item.title)
    .filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    )
    .slice(0, 3);

  if (titles.length === 0) {
    return "reference-driven visual language";
  }

  return titles.join(", ");
}

export function reversePromptFromReferences(input: ReversePromptInput): {
  reversePrompt: string;
  negativePrompt: string;
} {
  const keywords = inferKeywordFragment(input.references);
  const constraints =
    input.constraints.length > 0
      ? `Constraints: ${input.constraints.join("; ")}.`
      : "";

  const reversePrompt = [
    `Target style: ${input.styleGoal}.`,
    `Reference anchors: ${keywords}.`,
    "Produce cinematic composition, coherent lighting, and consistent texture language.",
    constraints,
  ]
    .filter((segment) => segment.length > 0)
    .join(" ");

  const negativePrompt =
    "low resolution, blurry details, text watermark, extra limbs, distorted anatomy, inconsistent style drift";

  return { reversePrompt, negativePrompt };
}

export async function getStyleProfile(
  scriptId: string,
): Promise<{ resourceId: string; profile: StyleProfile } | null> {
  const resources = await getResourcesByScope("script", scriptId);
  return extractStyleProfileFromScope(resources);
}

export interface SaveStyleProfileInput {
  scriptId: string;
  styleGoal: string;
  referenceImages: StyleReference[];
  reversePrompt: string;
  negativePrompt?: string;
  constraints?: string[];
  confirmed?: boolean;
}

export async function saveStyleProfile(
  input: SaveStyleProfileInput,
): Promise<{ resourceId: string; profile: StyleProfile }> {
  const existing = await getStyleProfile(input.scriptId);
  const nextVersion = (existing?.profile.version ?? 0) + 1;

  const parsedProfile = StyleProfileSchema.parse({
    styleGoal: input.styleGoal,
    referenceImages: input.referenceImages,
    reversePrompt: input.reversePrompt,
    negativePrompt: input.negativePrompt ?? "",
    constraints: input.constraints ?? [],
    confirmed: input.confirmed ?? false,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  });

  if (!existing) {
    const id = await createResource({
      scopeType: "script",
      scopeId: input.scriptId,
      category: STYLE_PROFILE_CATEGORY,
      mediaType: STYLE_PROFILE_MEDIA_TYPE,
      title: "Style Profile",
      data: parsedProfile,
      sortOrder: 0,
    });

    return { resourceId: id, profile: parsedProfile };
  }

  await updateResourceData(existing.resourceId, parsedProfile);
  return { resourceId: existing.resourceId, profile: parsedProfile };
}
