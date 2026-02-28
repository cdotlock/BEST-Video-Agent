import { listBySession } from "./image-generation-service";

/**
 * Build the "Image Registry" context block for LLM injection.
 *
 * Returns a markdown section listing all tracked images with their
 * current state (key, prompt, url, version). Returns empty string
 * if no images are tracked.
 *
 * This is a generic utility — any ContextProvider can call it.
 */
export async function buildImageRegistryContext(
  sessionId: string,
): Promise<string> {
  const images = await listBySession(sessionId);
  if (images.length === 0) return "";

  const lines = ["## Image Registry"];
  for (const img of images) {
    const promptSnippet = img.prompt
      ? `"${img.prompt.length > 60 ? img.prompt.slice(0, 60) + "..." : img.prompt}"`
      : "pending";
    const url = img.imageUrl ?? "none";
    lines.push(`- ${img.key}: prompt=${promptSnippet} url=${url} v=${img.currentVersion}`);
  }
  return lines.join("\n");
}
