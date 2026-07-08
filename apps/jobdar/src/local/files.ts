// The on-device Store (Phase 10) — the app's equivalent of the CLI's gitignored data/ + config/ dirs.
// Same formats on purpose (pipeline/feedback/outreach as TSV, cv as markdown, profile/portals as JSON):
// the pure engine functions (parsePipeline/serializePipeline/…) operate on these strings identically to
// the CLI, and a future export/import between phone and Mac is a file copy, not a migration.
import * as FS from 'expo-file-system/legacy';

const DIR = `${FS.documentDirectory}jobdar`;
const f = (name: string) => `${DIR}/${name}`;

async function ensureDir(): Promise<void> {
  await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
}

export async function readText(name: string): Promise<string> {
  try {
    const info = await FS.getInfoAsync(f(name));
    if (!info.exists) return '';
    return await FS.readAsStringAsync(f(name));
  } catch {
    return '';
  }
}

export async function writeText(name: string, content: string): Promise<void> {
  await ensureDir();
  await FS.writeAsStringAsync(f(name), content);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const t = await readText(name);
  if (!t) return fallback;
  try { return JSON.parse(t) as T; } catch { return fallback; }
}

export async function writeJson(name: string, value: any): Promise<void> {
  await writeText(name, JSON.stringify(value, null, 1));
}

// Named stores (one file each, mirroring the CLI's data home)
export const FILES = {
  pipeline: 'pipeline.tsv',
  cv: 'cv.md',
  profile: 'profile.json',
  portals: 'portals.json',
  feedback: 'eval_feedback.tsv',
  outreach: 'outreach.tsv',
} as const;
