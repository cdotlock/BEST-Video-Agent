/* ------------------------------------------------------------------ */
/*  Model configuration                                                */
/*  Edit this list to add/remove models available in the UI.           */
/* ------------------------------------------------------------------ */

export interface ModelOption {
  /** Model ID sent to the LLM provider (e.g. "anthropic/claude-sonnet-4.6"). */
  id: string;
  /** Short display label for the UI. */
  label: string;
  /** Exactly one model should be marked as default. */
  default?: boolean;
}

/**
 * Allowed models for the main controller.
 * Order matters — the UI will display them in this order.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  { id: "anthropic/claude-sonnet-4.6", label: "Sonnet", default: true },
  { id: "anthropic/claude-opus-4", label: "Opus" },
];

/* ---- Derived helpers (do not edit) ---- */

const modelIds = new Set(MODEL_OPTIONS.map((m) => m.id));

export const DEFAULT_MODEL =
  MODEL_OPTIONS.find((m) => m.default)?.id ?? MODEL_OPTIONS[0]!.id;

/** Returns the model id if it's in the allowed list, otherwise the default. */
export function resolveModel(model: string | undefined): string {
  if (model && modelIds.has(model)) return model;
  return DEFAULT_MODEL;
}
