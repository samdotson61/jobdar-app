// L0 SPIKE — on-device eval parity (dev-only route: jobdar://spike, not linked from the tabs).
// Runs the REAL engine eval (prepEval prompt + EVAL_JSON_SCHEMA + buildVerdict clamp/score) against a
// local GGUF via llama.rn — the same model file winc serves — and renders the verdict + timing so it can
// be compared 1:1 with a live `POST /evaluate` against winc. Greedy + grammar-JSON mirrors the winc eval
// profile. Simulator note: no Metal in the iOS sim → n_gpu_layers 0 (CPU); speed numbers are meaningless
// here, only OUTPUT parity counts. Push the model first:
//   xcrun simctl get_app_container booted com.jobdar.app data   → copy the .gguf into Documents/
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Paths } from 'expo-file-system';
import { initLlama } from 'llama.rn';
// @ts-ignore — pure-JS engine exports (same modules serve uses)
import { prepEval, buildVerdict, evalSystemFor, EVAL_JSON_SCHEMA } from '@jobdar/engine';
import { Btn, C, Card, H, Sub } from '@/src/ui';

const MODEL_FILE = 'Qwen3.5-4B-Q4_K_M.gguf'; // the exact file winc serves as qwen3.5-4b

// Pinned fixture — identical to the live winc /evaluate parity check (toggle-OFF variant so the MODEL,
// not the deterministic clamp, is what's being compared).
const JD = 'Product Analyst I at Acme. Entry level role. SQL and dashboards required. Applicants must be authorized to work in the United States without the need for visa sponsorship now or in the future.';
const CV = '# Alex Rivera\n\nNew grad. SQL, dashboards, user research, Excel.';
// Mirrors the dev box's config/profile.yml fixture so buildEvalUser produces the same prompt as serve.
const PROFILE = {
  name: 'Alex Rivera', language: 'en', location: 'Cincinnati, OH',
  target_regions: ['midwest'], target_levels: ['entry'], tuning_profile: 'career_changer',
  include_degree_required_roles: true, transferable_skills: true, target_salary: 0,
};

export default function Spike() {
  const [log, setLog] = useState<string[]>(['L0 spike — on-device eval parity vs winc.']);
  const [busy, setBusy] = useState(false);
  const add = (s: string) => { console.log('[spike]', s); setLog((l) => [...l, s]); };

  const run = async () => {
    setBusy(true);
    try {
      const modelPath = `${Paths.document.uri}/${MODEL_FILE}`.replace('file://', '');
      add(`model: ${modelPath}`);
      const t0 = Date.now();
      const ctx = await initLlama({ model: modelPath, n_ctx: 4096, n_gpu_layers: 0 });
      add(`init: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

      const today = new Date().toISOString().slice(0, 10);
      const { gates, decision, user } = prepEval({ jd: JD, cv: CV, profile: PROFILE, today });
      const t1 = Date.now();
      const r = await ctx.completion({
        messages: [
          { role: 'system', content: evalSystemFor(true) },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: EVAL_JSON_SCHEMA },
        temperature: 0, top_k: 1, n_predict: 1024,
      });
      const secs = ((Date.now() - t1) / 1000).toFixed(1);
      add(`completion: ${secs}s (CPU — sim numbers are not device numbers)`);
      const v = buildVerdict({ text: r.text, jd: JD, gates, decision, profile: PROFILE, transferable: true, model: MODEL_FILE, backend: 'llama.rn' });
      add(v.ok
        ? `VERDICT: ${v.band} · ${v.score}/5 · clamped:${v.clamped}\nrec: ${String(v.recommendation).slice(0, 160)}`
        : `PARSE FAIL — raw: ${String(r.text).slice(0, 300)}`);
      await ctx.release();
      add('context released.');
    } catch (e: any) {
      add(`ERROR: ${String(e?.message ?? e)}`);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>llama.rn spike</H>
      <Sub>Same GGUF, same prompt, same grammar as winc — output parity is the go/no-go.</Sub>
      <Btn label={busy ? 'Running…' : 'Run on-device eval'} disabled={busy} onPress={run} />
      <Card style={{ marginTop: 12 }}>
        {log.map((s, i) => (
          <Text key={i} style={{ color: C.text, fontSize: 12, lineHeight: 17, marginBottom: 6, fontFamily: 'SpaceMono' }}>{s}</Text>
        ))}
      </Card>
    </ScrollView>
  );
}
