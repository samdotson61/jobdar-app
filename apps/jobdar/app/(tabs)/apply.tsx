import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/src/store';
import { serveBase, backendMode } from '@/src/serve';
import { t } from '@/src/engine';
import { Btn, C, Card, Field, H, Pill, Sub, bandColor } from '@/src/ui';

// Export the beta report (1.55.0, web/desktop only): fetch the PII-free markdown from serve and hand it
// to the browser as a download — works identically in a plain browser tab and the Electron shell.
async function exportBetaReport(): Promise<void> {
  const r = await fetch(`${serveBase()}/report?format=md`);
  if (!r.ok) throw new Error(`report HTTP ${r.status}`);
  const blob = new Blob([await r.text()], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jobdar-beta-report-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Apply() {
  const profile = useStore((s) => s.profile);
  const scored = useStore((s) => s.scored);
  const verdicts = useStore((s) => s.verdicts);
  const feedback = useStore((s) => s.feedback);
  const scoring = useStore((s) => s.scoring);
  const rechecking = useStore((s) => s.rechecking);
  const tailored = useStore((s) => s.tailored);
  const { scoreOne, scoreTopN, rateVerdict, tailorOne, recheckListings } = useStore.getState();
  const lang = profile.language;
  const [dir, setDir] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const queue = scored.filter((j) => j.confirm !== 'skip');
  const unscored = queue.filter((j) => !verdicts[j.url]).length;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'apply.title')}</H>
      <Sub>{queue.length ? `${queue.length} roles past pre-confirm.` : 'Run Search first to build the queue.'}  ·  {t(lang, 'common.demo')}</Sub>
      {/* Honest scope (1.52.0): scores judge listing text vs résumé — nothing here vets the employer. */}
      <Text style={{ color: C.dim, fontSize: 11, marginBottom: 8 }}>{t(lang, 'apply.notVerified')}</Text>

      {/* Action hierarchy (1.21.0 calm-down): ONE primary — batch scoring. Re-check and Export are
          occasional utilities and share a quiet row; three stacked full-width primaries buried the
          roles below a wall of identical buttons. */}
      {unscored > 0 ? (
        <Btn
          label={scoring ? t(lang, 'apply.scoring') : t(lang, 'apply.scoreTop', { n: Math.min(unscored, 10) })}
          disabled={scoring}
          onPress={() => scoreTopN(10)}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {Object.keys(verdicts).length > 0 ? (
          <View style={{ flex: 1 }}>
            <Btn kind="ghost" label={rechecking ? t(lang, 'apply.rechecking') : t(lang, 'apply.recheck')} disabled={rechecking} onPress={() => recheckListings()} />
          </View>
        ) : null}
        {Platform.OS === 'web' && backendMode() === 'serve' ? (
          <View style={{ flex: 1 }}>
            <Btn kind="ghost" label={t(lang, 'apply.exportReport')} onPress={() => { exportBetaReport().catch(() => {}); }} />
          </View>
        ) : null}
      </View>

      {queue.map((j) => {
        const v = verdicts[j.url];
        const tl = tailored[j.url];
        // Tailored output opens its card by default, but an explicit Hide always wins.
        const isOpen = open[j.url] !== undefined ? open[j.url] : Boolean(tl);
        return (
          // The band stripe (1.21.0): Apply/Research/Don't scan by color from arm's length,
          // before any text is read. Unscored cards keep the neutral edge.
          <Card key={j.url} style={v ? { borderLeftWidth: 3, borderLeftColor: bandColor(v.band) } : undefined}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{j.role}</Text>
            <Text style={{ color: C.dim, marginBottom: 4 }}>{j.company} · {j.location}</Text>
            {/* Liveness (1.53.0): the board positively reported this posting gone — say so, and don't
                invite scoring a dead role. The verdict (if any) stays visible: history, not hype. */}
            {j.listingGone ? <Pill label={t(lang, 'apply.gone')} color={C.bad} text={C.bad} /> : null}

            {!v ? (
              j.listingGone ? null : <Btn label={t(lang, 'apply.score')} onPress={() => scoreOne(j.url)} />
            ) : (
              <View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Pill label={`${t(lang, `apply.band.${v.band}`)} · ${v.score.toFixed(1)}/5`} color={bandColor(v.band)} text={bandColor(v.band)} />
                  <Pill label={`${t(lang, 'common.pay')}: ${v.pay}`} />
                  {v.clamped ? <Pill label={`clamp: ${v.clamped}`} color={C.bad} text={C.bad} /> : null}
                </View>

                {/* The tester question (1.55.0) sits directly under the verdict — it's the one thing
                    every scored card asks of the person, so it never hides below the evidence. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <Text style={{ color: C.dim, fontSize: 12, marginRight: 8 }}>{t(lang, 'apply.rate')}</Text>
                  {(['up', 'down'] as const).map((th) => {
                    const on = feedback[j.url] === th;
                    const tint = th === 'up' ? C.good : C.bad;
                    return (
                      <Pressable key={th} onPress={() => rateVerdict(j.url, th)} hitSlop={8}
                        style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginRight: 6,
                                 borderWidth: 1, borderColor: on ? tint : C.cardEdge, backgroundColor: on ? tint + '22' : 'transparent' }}>
                        <Text style={{ fontSize: 13, color: on ? tint : C.dim, opacity: on ? 1 : 0.8 }}>{t(lang, th === 'up' ? 'apply.wouldApply' : 'apply.wouldnt')}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Progressive disclosure (1.21.0): the five-criterion evidence and the tailor tools
                    expand on demand. Every card used to render ~120 words of evidence plus a steer
                    field and a button unconditionally — the "very busy" feedback in one line. */}
                <Pressable onPress={() => setOpen((o) => ({ ...o, [j.url]: !isOpen }))} hitSlop={6} style={{ marginTop: 8 }}>
                  <Text style={{ color: C.tint, fontSize: 12.5, fontWeight: '600' }}>
                    {isOpen ? `${t(lang, 'apply.hideWhy')} ▴` : `${t(lang, 'apply.showWhy')} ▾`}
                  </Text>
                </Pressable>

                {isOpen ? (
                  <View>
                    {v.criteria.map((c) => (
                      <Text key={c.key} style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                        <Text style={{ color: c.judgment === 'strong' ? C.good : c.judgment === 'partial' ? C.warn : C.bad }}>
                          {c.judgment === 'strong' ? '●' : c.judgment === 'partial' ? '◐' : '○'} {c.key} ({Math.round(c.weight * 100)}%)
                        </Text>{'  '}{c.evidence}
                      </Text>
                    ))}

                    <Field
                      placeholder={t(lang, 'apply.directive')}
                      value={dir[j.url] ?? ''}
                      onChangeText={(x) => setDir((d) => ({ ...d, [j.url]: x }))}
                    />
                    <Btn kind="ghost" label={t(lang, 'apply.tailor')} onPress={() => tailorOne(j.url, (dir[j.url] ?? '').split(',').map((s) => s.trim()).filter(Boolean))} />

                    {tl ? (
                      <View style={{ marginTop: 8, borderTopColor: C.cardEdge, borderTopWidth: 1, paddingTop: 8 }}>
                        <Text style={{ color: C.tint, fontWeight: '700', fontSize: 12, marginBottom: 4 }}>{t(lang, 'apply.summary')}</Text>
                        <Text style={{ color: C.text, fontSize: 13, lineHeight: 18 }}>{tl.summary}</Text>
                        <Text style={{ color: C.dim, fontSize: 12, marginTop: 8, lineHeight: 17 }}>{tl.coverLetter}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                          {tl.keywords.map((k) => <Pill key={k} label={k} />)}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
