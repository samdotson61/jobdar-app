import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/src/store';
import { t } from '@/src/engine';
import { Btn, C, Card, Field, H, Pill, Sub, bandColor } from '@/src/ui';

export default function Apply() {
  const profile = useStore((s) => s.profile);
  const scored = useStore((s) => s.scored);
  const verdicts = useStore((s) => s.verdicts);
  const feedback = useStore((s) => s.feedback);
  const scoring = useStore((s) => s.scoring);
  const tailored = useStore((s) => s.tailored);
  const { scoreOne, scoreTopN, rateVerdict, tailorOne } = useStore.getState();
  const lang = profile.language;
  const [dir, setDir] = useState<Record<string, string>>({});
  const queue = scored.filter((j) => j.confirm !== 'skip');
  const unscored = queue.filter((j) => !verdicts[j.url]).length;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'apply.title')}</H>
      <Sub>{queue.length ? `${queue.length} roles past pre-confirm.` : 'Run Search first to build the queue.'}  ·  {t(lang, 'common.demo')}</Sub>

      {/* Batch-score the top matches instead of tapping each — pool-bounded so winc stays responsive. */}
      {unscored > 0 ? (
        <Btn
          label={scoring ? t(lang, 'apply.scoring') : t(lang, 'apply.scoreTop', { n: Math.min(unscored, 10) })}
          disabled={scoring}
          onPress={() => scoreTopN(10)}
        />
      ) : null}

      {queue.map((j) => {
        const v = verdicts[j.url];
        const tl = tailored[j.url];
        return (
          <Card key={j.url}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{j.role}</Text>
            <Text style={{ color: C.dim, marginBottom: 4 }}>{j.company} · {j.location}</Text>

            {!v ? (
              <Btn label={t(lang, 'apply.score')} onPress={() => scoreOne(j.url)} />
            ) : (
              <View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Pill label={`${t(lang, `apply.band.${v.band}`)} · ${v.score.toFixed(1)}/5`} color={bandColor(v.band)} text={bandColor(v.band)} />
                  <Pill label={`${t(lang, 'common.pay')}: ${v.pay}`} />
                  {v.clamped ? <Pill label={`clamp: ${v.clamped}`} color={C.bad} text={C.bad} /> : null}
                </View>
                {v.criteria.map((c) => (
                  <Text key={c.key} style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                    <Text style={{ color: c.judgment === 'strong' ? C.good : c.judgment === 'partial' ? C.warn : C.bad }}>
                      {c.judgment === 'strong' ? '●' : c.judgment === 'partial' ? '◐' : '○'} {c.key} ({Math.round(c.weight * 100)}%)
                    </Text>{'  '}{c.evidence}
                  </Text>
                ))}

                {/* Thumbs = a human label on this verdict. Feeds the local calibration ledger (jobfaro calibrate --feedback). */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ color: C.dim, fontSize: 12, marginRight: 8 }}>{t(lang, 'apply.rate')}</Text>
                  {(['up', 'down'] as const).map((th) => {
                    const on = feedback[j.url] === th;
                    const tint = th === 'up' ? C.good : C.bad;
                    return (
                      <Pressable key={th} onPress={() => rateVerdict(j.url, th)} hitSlop={8}
                        style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 6,
                                 borderWidth: 1, borderColor: on ? tint : C.cardEdge, backgroundColor: on ? tint + '22' : 'transparent' }}>
                        <Text style={{ fontSize: 15, opacity: on ? 1 : 0.6 }}>{th === 'up' ? '👍' : '👎'}</Text>
                      </Pressable>
                    );
                  })}
                </View>

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
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
