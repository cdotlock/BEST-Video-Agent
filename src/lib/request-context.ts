import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  userName?: string;
  sessionId?: string;
}

// Survive Next.js HMR — same pattern as registry.ts
const g = globalThis as unknown as {
  __requestContext?: AsyncLocalStorage<RequestContext>;
};

export const requestContext =
  g.__requestContext ?? (g.__requestContext = new AsyncLocalStorage<RequestContext>());

export function getCurrentUserName(): string | undefined {
  return requestContext.getStore()?.userName;
}

export function getCurrentSessionId(): string | undefined {
  return requestContext.getStore()?.sessionId;
}
