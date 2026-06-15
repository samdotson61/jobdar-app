import { Pressable, StyleSheet, Text, TextInput, View, type ViewProps } from 'react-native';

export const C = {
  bg: '#0b1220', card: '#151d2e', cardEdge: '#243149', text: '#e8edf6', dim: '#9fb0c9',
  tint: '#4cc2ff', good: '#39d98a', warn: '#ffcf5c', bad: '#ff6b6b', chip: '#1e2942',
};
export const bandColor = (b: string) => (b === 'apply' ? C.good : b === 'research' ? C.warn : C.bad);
export const confirmColor = (c?: string) => (c === 'fit' ? C.good : c === 'maybe' ? C.warn : C.dim);

export function Card({ style, ...p }: ViewProps) {
  return <View style={[s.card, style]} {...p} />;
}
export function H({ children }: { children: React.ReactNode }) {
  return <Text style={s.h}>{children}</Text>;
}
export function Sub({ children }: { children: React.ReactNode }) {
  return <Text style={s.sub}>{children}</Text>;
}
export function Pill({ label, color = C.chip, text = C.text }: { label: string; color?: string; text?: string }) {
  return <Text style={[s.pill, { backgroundColor: color + '22', color: text, borderColor: color + '66' }]}>{label}</Text>;
}
export function Btn({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [
      s.btn, kind === 'ghost' ? s.btnGhost : s.btnPrimary,
      { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
    ]}>
      <Text style={[s.btnText, kind === 'ghost' && { color: C.tint }]}>{label}</Text>
    </Pressable>
  );
}
export function Field(p: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={C.dim} {...p} style={[s.field, p.style]} />;
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderColor: C.cardEdge, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  h: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  sub: { color: C.dim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  pill: { fontSize: 12, fontWeight: '600', overflow: 'hidden', borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3, marginRight: 6, marginTop: 6 },
  btn: { borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', marginTop: 8 },
  btnPrimary: { backgroundColor: C.tint },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.tint + '66' },
  btnText: { color: '#06121f', fontWeight: '700', fontSize: 14 },
  field: { backgroundColor: C.bg, borderColor: C.cardEdge, borderWidth: 1, borderRadius: 10, color: C.text, padding: 10, marginTop: 8 },
});
