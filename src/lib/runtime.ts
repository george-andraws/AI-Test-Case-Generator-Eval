export const DEMO_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type StorageMode = "local" | "demo";

export function getStorageMode(): StorageMode {
  return process.env.APP_STORAGE_MODE === "demo" ? "demo" : "local";
}

export function isDemoMode(): boolean {
  return getStorageMode() === "demo";
}

export function getModelProfile(): "research" | "demo" {
  return process.env.NEXT_PUBLIC_MODEL_PROFILE === "demo" || process.env.MODEL_PROFILE === "demo"
    ? "demo"
    : "research";
}

export function isDemoModelProfile(): boolean {
  return getModelProfile() === "demo";
}

export function isLangfuseConfigured(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

export function resolveLangfuseEnabled(explicit?: boolean): boolean {
  if (!isLangfuseConfigured()) return false;
  if (explicit !== undefined) return explicit;
  if (process.env.LANGFUSE_ENABLED === "false") return false;
  if (isDemoMode()) return process.env.NEXT_PUBLIC_LANGFUSE_DEFAULT_ENABLED === "true";
  return true;
}
