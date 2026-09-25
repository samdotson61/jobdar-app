// Web stub — the web app stays serve-backed (local mode is native-only), so llama.rn never enters the
// web bundle. Every function reports honest unavailability; nothing here should ever be reached because
// serve.ts never routes to the local backend on web.
export const MODEL_TIERS = [] as const;
export type ModelTier = never;
export function recommendedTier(): any { return null; }
export async function installedTier(): Promise<null> { return null; }
export async function downloadModel(): Promise<void> { throw new Error('on-device model is native-only'); }
export async function deleteModels(): Promise<void> {}
export async function releaseLlm(): Promise<void> {}
export async function completionJson(): Promise<{ text: string; model: string }> {
  throw new Error('on-device model is native-only');
}
export const llmAvailable = () => false;
