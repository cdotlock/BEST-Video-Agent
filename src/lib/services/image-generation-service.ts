import { prisma } from "@/lib/db";
import { callFcGenerateImage } from "./fc-image-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GenerateImageInput {
  sessionId: string;
  key: string;
  prompt: string;
  refUrls?: string[];
}

export interface GenerateImageResult {
  id: string;
  key: string;
  imageUrl: string;
  version: number;
}

export interface ImageGenSummary {
  id: string;
  key: string;
  currentVersion: number;
  /** Current version's data (null if no versions yet) */
  prompt: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImageGenVersionRow {
  id: string;
  version: number;
  prompt: string;
  imageUrl: string | null;
  refUrls: string[];
  createdAt: Date;
}

export interface ImageGenDetail {
  id: string;
  sessionId: string;
  key: string;
  currentVersion: number;
  /** Current version's data */
  prompt: string | null;
  imageUrl: string | null;
  versions: ImageGenVersionRow[];
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get the next version number for an ImageGeneration. */
async function nextVersion(imageGenId: string): Promise<number> {
  const last = await prisma.imageGenerationVersion.findFirst({
    where: { imageGenId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}

/** Resolve current version row for an ImageGeneration. */
async function currentVersionRow(imageGenId: string, currentVersion: number) {
  if (currentVersion === 0) return null;
  return prisma.imageGenerationVersion.findUnique({
    where: {
      imageGenId_version: { imageGenId, version: currentVersion },
    },
  });
}

/* ------------------------------------------------------------------ */
/*  generateImage — LLM / MCP tool entry point                         */
/* ------------------------------------------------------------------ */

/**
 * Create or update an ImageGeneration entity + call FC + write version.
 *
 * 1. Upsert ImageGeneration by (sessionId, key) — identity only
 * 2. Create new version (imageUrl = null initially)
 * 3. Call FC to generate image
 * 4. Update version with imageUrl + set currentVersion
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const { sessionId, key, prompt, refUrls } = input;

  // 1. Upsert identity record
  const gen = await prisma.imageGeneration.upsert({
    where: { sessionId_key: { sessionId, key } },
    create: { sessionId, key },
    update: {},
  });

  // 2. Create new version
  const ver = await nextVersion(gen.id);
  const versionRow = await prisma.imageGenerationVersion.create({
    data: {
      imageGenId: gen.id,
      version: ver,
      prompt,
      refUrls: refUrls ?? [],
    },
  });

  // 3. Call FC
  const imageUrl = await callFcGenerateImage(prompt, refUrls);

  // 4. Update version imageUrl + bump currentVersion
  await prisma.$transaction([
    prisma.imageGenerationVersion.update({
      where: { id: versionRow.id },
      data: { imageUrl },
    }),
    prisma.imageGeneration.update({
      where: { id: gen.id },
      data: { currentVersion: ver },
    }),
  ]);

  return { id: gen.id, key, imageUrl, version: ver };
}

/* ------------------------------------------------------------------ */
/*  regenerate — out-of-band (UI-driven) regeneration                  */
/* ------------------------------------------------------------------ */

export interface RegenerateResult {
  id: string;
  key: string;
  imageUrl: string;
  version: number;
  prompt: string;
}

/**
 * Regenerate an image without LLM involvement.
 * Uses the current version's prompt+refUrls (or overrides).
 */
export async function regenerate(
  id: string,
  promptOverride?: string,
): Promise<RegenerateResult> {
  const gen = await prisma.imageGeneration.findUniqueOrThrow({
    where: { id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const lastVer = gen.versions[0];
  const prompt = promptOverride ?? lastVer?.prompt ?? "";
  const refUrls = lastVer?.refUrls ?? [];

  // Create new version
  const ver = await nextVersion(gen.id);
  const versionRow = await prisma.imageGenerationVersion.create({
    data: {
      imageGenId: gen.id,
      version: ver,
      prompt,
      refUrls,
    },
  });

  // Call FC
  const imageUrl = await callFcGenerateImage(prompt, refUrls.length > 0 ? refUrls : undefined);

  // Update version + currentVersion
  await prisma.$transaction([
    prisma.imageGenerationVersion.update({
      where: { id: versionRow.id },
      data: { imageUrl },
    }),
    prisma.imageGeneration.update({
      where: { id: gen.id },
      data: { currentVersion: ver },
    }),
  ]);

  return { id: gen.id, key: gen.key, imageUrl, version: ver, prompt };
}

/* ------------------------------------------------------------------ */
/*  rollback — move currentVersion pointer                             */
/* ------------------------------------------------------------------ */

export interface RollbackResult {
  id: string;
  key: string;
  version: number;
  prompt: string;
  imageUrl: string | null;
}

/**
 * Rollback to a specific version. Zero-copy — just moves the pointer.
 */
export async function rollback(
  id: string,
  targetVersion: number,
): Promise<RollbackResult> {
  // Verify target version exists
  const gen = await prisma.imageGeneration.findUniqueOrThrow({
    where: { id },
  });

  const ver = await prisma.imageGenerationVersion.findUnique({
    where: {
      imageGenId_version: { imageGenId: gen.id, version: targetVersion },
    },
  });
  if (!ver) {
    throw new Error(`Version ${targetVersion} not found for image "${gen.key}"`);
  }

  await prisma.imageGeneration.update({
    where: { id: gen.id },
    data: { currentVersion: targetVersion },
  });

  return {
    id: gen.id,
    key: gen.key,
    version: targetVersion,
    prompt: ver.prompt,
    imageUrl: ver.imageUrl,
  };
}

/* ------------------------------------------------------------------ */
/*  updatePrompt — create new version reusing current imageUrl          */
/* ------------------------------------------------------------------ */

export interface UpdatePromptResult {
  id: string;
  key: string;
  version: number;
  prompt: string;
  imageUrl: string | null;
}

/**
 * Update the prompt without triggering image generation.
 * Creates a new version that reuses the current version's imageUrl.
 */
export async function updatePrompt(
  id: string,
  newPrompt: string,
): Promise<UpdatePromptResult> {
  const gen = await prisma.imageGeneration.findUniqueOrThrow({
    where: { id },
  });

  const curVer = await currentVersionRow(gen.id, gen.currentVersion);

  const ver = await nextVersion(gen.id);
  await prisma.imageGenerationVersion.create({
    data: {
      imageGenId: gen.id,
      version: ver,
      prompt: newPrompt,
      imageUrl: curVer?.imageUrl ?? null,
      refUrls: curVer?.refUrls ?? [],
    },
  });

  await prisma.imageGeneration.update({
    where: { id: gen.id },
    data: { currentVersion: ver },
  });

  return {
    id: gen.id,
    key: gen.key,
    version: ver,
    prompt: newPrompt,
    imageUrl: curVer?.imageUrl ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Get a single ImageGeneration with all versions.
 * Resolves current version data inline.
 */
export async function getById(id: string): Promise<ImageGenDetail | null> {
  const gen = await prisma.imageGeneration.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { version: "asc" } },
    },
  });
  if (!gen) return null;

  const curVer = gen.versions.find((v) => v.version === gen.currentVersion);

  return {
    id: gen.id,
    sessionId: gen.sessionId,
    key: gen.key,
    currentVersion: gen.currentVersion,
    prompt: curVer?.prompt ?? null,
    imageUrl: curVer?.imageUrl ?? null,
    versions: gen.versions.map((v) => ({
      id: v.id,
      version: v.version,
      prompt: v.prompt,
      imageUrl: v.imageUrl,
      refUrls: v.refUrls,
      createdAt: v.createdAt,
    })),
    createdAt: gen.createdAt,
    updatedAt: gen.updatedAt,
  };
}

/**
 * List all ImageGenerations for a session with current version summary.
 */
export async function listBySession(
  sessionId: string,
): Promise<ImageGenSummary[]> {
  const gens = await prisma.imageGeneration.findMany({
    where: { sessionId },
    include: {
      versions: { orderBy: { version: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  return gens.map((gen) => {
    const curVer = gen.versions.find((v) => v.version === gen.currentVersion);
    return {
      id: gen.id,
      key: gen.key,
      currentVersion: gen.currentVersion,
      prompt: curVer?.prompt ?? null,
      imageUrl: curVer?.imageUrl ?? null,
      createdAt: gen.createdAt,
      updatedAt: gen.updatedAt,
    };
  });
}
