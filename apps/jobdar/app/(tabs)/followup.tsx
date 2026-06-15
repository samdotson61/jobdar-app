import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '@/src/store';
import { t, CADENCE } from '@/src/engine';
import { Btn, C, Card, Field, H, Pill, Sub } from '@/src/ui';

export default function Followup() {
  const profile = useStore((s) => s.profile);
  const scored = useStore((s) => s.scored);
  const verdicts = useStore((s) => s.verdicts);
  const drafts = useStore((s) => s.drafts);
  const ledger = useStore((s) => s.ledger);
  const { draftOne, logContact } = useStore.getState();
  const lang = profile.language;
  const [person, setPerson] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string>('');

  // Prefer roles you'd actually pursue (Apply/Research band), else anything past pre-confirm.
  const worth = scored.filter((j) => j.confirm !== 'skip');
  const list = worth.filter((j) => (verdicts[j.url]?.band ?? 'research') !== 'dont');

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <H>{t(lang, 'followup.title')}</H>
      <Sub>{t(lang, 'followup.cadence')}</Sub>

      {list.length === 0 ? <Sub>Run Search (and Apply) first.</Sub> : null}

      {list.map((j) => {
        const d = drafts[j.url];
        const used = ledger.filter((e) => e.url === j.url && e.kind === 'contact').length;
        return (
          <Card key={j.url}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{j.role}</Text>
            <Text style={{ color: C.dim, marginBottom: 4 }}>{j.company} · {j.location}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Pill label={`${used}/${CADENCE.maxContactsPerRole} contacted`} color={used >= CADENCE.maxContactsPerRole ? C.warn : C.chip} text={used >= CADENCE.maxContactsPerRole ? C.warn : C.dim} />
            </View>

            <Field placeholder={t(lang, 'followup.person')} value={person[j.url] ?? ''} onChangeText={(x) => setPerson((p) => ({ ...p, [j.url]: x }))} />
            <Btn kind="ghost" label={t(lang, 'followup.draft')} onPress={() => draftOne(j.url, person[j.url] ?? '')} />

            {d ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: C.text, fontSize: 13, lineHeight: 18 }}>{d.message}</Text>
                <Text style={{ color: d.problems.length ? C.bad : C.good, fontSize: 12, marginTop: 6 }}>
                  {d.problems.length ? `⚠ ${d.problems.join(', ')}` : `✓ ${t(lang, 'followup.lint.ok')}`}
                </Text>
                <Btn
                  label="Log sent contact"
                  disabled={used >= CADENCE.maxContactsPerRole}
                  onPress={() => {
                    const r = logContact(j.url, person[j.url] ?? 'Alex Kim');
                    setNote(r.ok ? `Logged contact for ${j.company}.` : `Blocked: ${r.reason}.`);
                  }}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
      {note ? <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>{note}</Text> : null}
    </ScrollView>
  );
}
