// On-device model runtime (Phase 10) — llama.rn (llama.cpp) with the SAME eval profile winc serves:
// greedy decoding + grammar-constrained JSON (response_format json_schema → GBNF). Metro resolves this
// .native file on iOS/Android; llm.web.ts is the web stub (web stays serve-backed).
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as FS from 'expo-file-system/legacy';
import { initLlama, type LlamaContext } from 'llama.rn';

// The same registry winc uses (unsloth GGUF repos on HuggingFace).
export const MODEL_TIERS = [
  { tier: '4b', file: 'Qwen3.5-4B-Q4_K_M.gguf', repo: 'unsloth/Qwen3.5-4B-GGUF', sizeGb: 2.6, minRamGb: 7 },
  { tier: '2b', file: 'Qwen3.5-2B-Q4_K_M.gguf', repo: 'unsloth/Qwen3.5-2B-GGUF', sizeGb: 1.2, minRamGb: 0 },
] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

const MODELS_DIR = `${FS.documentDirectory}models`;
const hfUrl = (m: ModelTier) => `https://huggingface.co/${m.repo}/resolve/main/${m.file}`;
const modelPath = (m: ModelTier) => `${MODELS_DIR}/${m.file}`;

// The tier this device can hold: the 4b Q4 (~2.4GB resident) needs ~8GB devices; everything else gets
// the 2b. Honest label — the 2b is flatter on borderline calls (documented in eval-tuning-research).
export function recommendedTier(): ModelTier {
  const ramGb = (Device.totalMemory ?? 0) / (1024 * 1024 * 1024);
  return MODEL_TIERS.find((m) => ramGb >= m.minRamGb) ?? MODEL_TIERS[MODEL_TIERS.length - 1];
}

export async function installedTier(): Promise<ModelTier | null> {
  for (const m of MODEL_TIERS) {
    const info = await FS.getInfoAsync(modelPath(m));
    if (info.exists && (info.size ?? 0) > 100 * 1024 * 1024) return m; // a partial download never counts
  }
  // Dev convenience: the L0 spike drops a model in Documents root — honor it as the 4b.
  const spike = await FS.getInfoAsync(`${FS.documentDirectory}${MODEL_TIERS[0].file}`);
  return spike.exists ? MODEL_TIERS[0] : null;
}

export async function downloadModel(m: ModelTier, onProgress: (frac: number) => void): Promise<void> {
  await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true }).catch(() => {});
  const dl = FS.createDownloadResumable(hfUrl(m), modelPath(m), {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const res = await dl.downloadAsync();
  if (!res || (res.status !== 200 && res.status !== 206)) {
    await FS.deleteAsync(modelPath(m), { idempotent: true }).catch(() => {});
    throw new Error(`model download failed (HTTP ${res ? res.status : '?'})`);
  }
}

export async function deleteModels(): Promise<void> {
  await releaseLlm();
  for (const m of MODEL_TIERS) await FS.deleteAsync(modelPath(m), { idempotent: true }).catch(() => {});
}

// One context, initialized on first use, kept warm across evals (init is the expensive part).
let ctx: LlamaContext | null = null;
let ctxFile = '';
async function ensureContext(): Promise<LlamaContext> {
  const m = await installedTier();
  if (!m) throw new Error('no-model'); // callers surface the download UX
  const info = await FS.getInfoAsync(modelPath(m));
  const path = (info.exists ? modelPath(m) : `${FS.documentDirectory}${m.file}`).replace('file://', '');
  if (ctx && ctxFile === path) return ctx;
  await releaseLlm();
  try {
    ctx = await initLlama({ model: path, n_ctx: 4096, n_gpu_layers: 99 });
  } catch {
    // The iOS simulator has no Metal for llama.cpp — retry on CPU so dev parity checks still run.
    ctx = await initLlama({ model: path, n_ctx: 4096, n_gpu_layers: 0 });
  }
  ctxFile = path;
  return ctx;
}

export async function releaseLlm(): Promise<void> {
  const c = ctx;
  ctx = null;
  ctxFile = '';
  if (c) await c.release().catch(() => {});
}

// One grammar-constrained, greedy JSON completion — the exact contract the engine sends winc.
export async function completionJson(opts: { system: string; user: string; schema: any; maxTokens?: number }): Promise<{ text: string; model: string }> {
  const c = await ensureContext();
  const r = await c.completion({
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    response_format: { type: 'json_schema', json_schema: opts.schema },
    temperature: 0, top_k: 1, n_predict: opts.maxTokens ?? 1024,
  });
  return { text: r.text, model: ctxFile.split('/').pop() || 'on-device' };
}

export const llmAvailable = () => Platform.OS !== 'web';
