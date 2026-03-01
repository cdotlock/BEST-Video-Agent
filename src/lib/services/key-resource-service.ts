import { prisma } from "@/lib/db";
import type { Prisma as PrismaTypes } from "@/generated/prisma";
import { callFcGenerateImage } from "./fc-image-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface VersionData {
  title?: string;
  url?: string;
  data?: PrismaTypes.InputJsonValue;
  prompt?: string;
  refUrls?: string[];
}

export interface KeyResourceRow {
  id: string;
  key: string;
  mediaType: string;
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyResourceVersionRow {
  id: string;
  version: number;
  title: string | null;
  url: string | null;
  data: PrismaTypes.JsonValue;
  prompt: string | null;
  refUrls: string[];
  createdAt: Date;
}

export interface KeyResourceSummary {
  id: string;
  key: string;
  mediaType: string;
  currentVersion: number;
  /** Current version's snapshot */
  title: string | null;
  url: string | null;
  data: PrismaTypes.JsonValue;
  prompt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyResourceDetail {
  id: string;
  sessionId: string;
  key: string;
  mediaType: string;
  currentVersion: number;
  title: string | null;
  url: string | null;
  data: PrismaTypes.JsonValue;
  prompt: string | null;
  versions: KeyResourceVersionRow[];
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function nextVersion(keyResourceId: string): Promise<number> {
  const last = await prisma.keyResourceVersion.findFirst({
    where: { keyResourceId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}

function currentVersionData(
  versions: KeyResourceVersionRow[],
  currentVersion: number,
): { title: string | null; url: string | null; data: PrismaTypes.JsonValue; prompt: string | null } {
  const ver = versions.find((v) => v.version === currentVersion);
  return {
    title: ver?.title ?? null,
    url: ver?.url ?? null,
    data: ver?.data ?? null,
    prompt: ver?.prompt ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  upsertResource — universal entry point                             */
/* ------------------------------------------------------------------ */

/**
 * Upsert a key resource by (sessionId, key).
 * Always creates a new version. Returns the identity row + new version number.
 */
export async function upsertResource(
  sessionId: string,
  key: string,
  mediaType: string,
  versionData: VersionData,
): Promise<KeyResourceRow & { version: number }> {
  // 1. Upsert identity
  const resource = await prisma.keyResource.upsert({
    where: { sessionId_key: { sessionId, key } },
    create: { sessionId, key, mediaType },
    update: {},
  });

  // 2. Create new version
  const ver = await nextVersion(resource.id);
  await prisma.keyResourceVersion.create({
    data: {
      keyResourceId: resource.id,
      version: ver,
      title: versionData.title ?? null,
      url: versionData.url ?? null,
      data: versionData.data ?? undefined,
      prompt: versionData.prompt ?? null,
      refUrls: versionData.refUrls ?? [],
    },
  });

  // 3. Bump currentVersion
  const updated = await prisma.keyResource.update({
    where: { id: resource.id },
    data: { currentVersion: ver },
  });

  return { ...updated, version: ver };
}

/* ------------------------------------------------------------------ */
/*  generateImage — FC image generation                                */
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

export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const { sessionId, key, prompt, refUrls } = input;

  // 1. Upsert identity
  const resource = await prisma.keyResource.upsert({
    where: { sessionId_key: { sessionId, key } },
    create: { sessionId, key, mediaType: "image" },
    update: {},
  });

  // 2. Create version (url = null initially)
  const ver = await nextVersion(resource.id);
  const versionRow = await prisma.keyResourceVersion.create({
    data: {
      keyResourceId: resource.id,
      version: ver,
      prompt,
      refUrls: refUrls ?? [],
    },
  });

  // 3. Call FC
  const imageUrl = await callFcGenerateImage(prompt, refUrls);

  // 4. Update version url + bump currentVersion
  await prisma.$transaction([
    prisma.keyResourceVersion.update({
      where: { id: versionRow.id },
      data: { url: imageUrl },
    }),
    prisma.keyResource.update({
      where: { id: resource.id },
      data: { currentVersion: ver },
    }),
  ]);

  return { id: resource.id, key, imageUrl, version: ver };
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

export async function regenerate(
  id: string,
  promptOverride?: string,
): Promise<RegenerateResult> {
  const resource = await prisma.keyResource.findUniqueOrThrow({
    where: { id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const lastVer = resource.versions[0];
  const prompt = promptOverride ?? lastVer?.prompt ?? "";
  const refUrls = lastVer?.refUrls ?? [];

  const ver = await nextVersion(resource.id);
  const versionRow = await prisma.keyResourceVersion.create({
    data: {
      keyResourceId: resource.id,
      version: ver,
      prompt,
      refUrls,
    },
  });

  const imageUrl = await callFcGenerateImage(prompt, refUrls.length > 0 ? refUrls : undefined);

  await prisma.$transaction([
    prisma.keyResourceVersion.update({
      where: { id: versionRow.id },
      data: { url: imageUrl },
    }),
    prisma.keyResource.update({
      where: { id: resource.id },
      data: { currentVersion: ver },
    }),
  ]);

  return { id: resource.id, key: resource.key, imageUrl, version: ver, prompt };
}

/* ------------------------------------------------------------------ */
/*  rollback — move currentVersion pointer                             */
/* ------------------------------------------------------------------ */

export interface RollbackResult {
  id: string;
  key: string;
  version: number;
  prompt: string | null;
  url: string | null;
}

export async function rollback(
  id: string,
  targetVersion: number,
): Promise<RollbackResult> {
  const resource = await prisma.keyResource.findUniqueOrThrow({ where: { id } });

  const ver = await prisma.keyResourceVersion.findUnique({
    where: {
      keyResourceId_version: { keyResourceId: resource.id, version: targetVersion },
    },
  });
  if (!ver) {
    throw new Error(`Version ${targetVersion} not found for resource "${resource.key}"`);
  }

  await prisma.keyResource.update({
    where: { id: resource.id },
    data: { currentVersion: targetVersion },
  });

  return {
    id: resource.id,
    key: resource.key,
    version: targetVersion,
    prompt: ver.prompt,
    url: ver.url,
  };
}

/* ------------------------------------------------------------------ */
/*  updatePrompt — create new version reusing current url              */
/* ------------------------------------------------------------------ */

export interface UpdatePromptResult {
  id: string;
  key: string;
  version: number;
  prompt: string;
  url: string | null;
}

export async function updatePrompt(
  id: string,
  newPrompt: string,
): Promise<UpdatePromptResult> {
  const resource = await prisma.keyResource.findUniqueOrThrow({ where: { id } });

  const curVer = resource.currentVersion > 0
    ? await prisma.keyResourceVersion.findUnique({
        where: { keyResourceId_version: { keyResourceId: resource.id, version: resource.currentVersion } },
      })
    : null;

  const ver = await nextVersion(resource.id);
  await prisma.keyResourceVersion.create({
    data: {
      keyResourceId: resource.id,
      version: ver,
      prompt: newPrompt,
      url: curVer?.url ?? null,
      refUrls: curVer?.refUrls ?? [],
    },
  });

  await prisma.keyResource.update({
    where: { id: resource.id },
    data: { currentVersion: ver },
  });

  return {
    id: resource.id,
    key: resource.key,
    version: ver,
    prompt: newPrompt,
    url: curVer?.url ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

export async function getById(id: string): Promise<KeyResourceDetail | null> {
  const resource = await prisma.keyResource.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "asc" } } },
  });
  if (!resource) return null;

  const cur = currentVersionData(resource.versions, resource.currentVersion);

  return {
    id: resource.id,
    sessionId: resource.sessionId,
    key: resource.key,
    mediaType: resource.mediaType,
    currentVersion: resource.currentVersion,
    ...cur,
    versions: resource.versions.map((v) => ({
      id: v.id,
      version: v.version,
      title: v.title,
      url: v.url,
      data: v.data,
      prompt: v.prompt,
      refUrls: v.refUrls,
      createdAt: v.createdAt,
    })),
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

export async function listBySession(
  sessionId: string,
): Promise<KeyResourceSummary[]> {
  return listResources({ sessionId });
}

export async function listByMediaType(
  sessionId: string,
  mediaType: string,
): Promise<KeyResourceSummary[]> {
  return listResources({ sessionId, mediaType });
}

async function listResources(
  filter: { sessionId?: string; mediaType?: string },
): Promise<KeyResourceSummary[]> {
  const where: PrismaTypes.KeyResourceWhereInput = {};
  if (filter.sessionId) where.sessionId = filter.sessionId;
  if (filter.mediaType) where.mediaType = filter.mediaType;

  const resources = await prisma.keyResource.findMany({
    where,
    include: { versions: { orderBy: { version: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return resources.map((r) => {
    const cur = currentVersionData(r.versions, r.currentVersion);
    return {
      id: r.id,
      key: r.key,
      mediaType: r.mediaType,
      currentVersion: r.currentVersion,
      ...cur,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

/**
 * List key resources for a session — flat view for session detail API.
 * Returns one entry per resource with current version data resolved.
 */
export async function listForSession(
  sessionId: string,
): Promise<Array<{
  id: string;
  key: string;
  mediaType: string;
  currentVersion: number;
  title: string | null;
  url: string | null;
  data: PrismaTypes.JsonValue;
}>> {
  const resources = await prisma.keyResource.findMany({
    where: { sessionId },
    include: { versions: { orderBy: { version: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return resources.map((r) => {
    const cur = currentVersionData(r.versions, r.currentVersion);
    return {
      id: r.id,
      key: r.key,
      mediaType: r.mediaType,
      currentVersion: r.currentVersion,
      title: cur.title,
      url: cur.url,
      data: cur.data,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

export async function deleteResource(id: string): Promise<void> {
  await prisma.keyResource.delete({ where: { id } });
}
