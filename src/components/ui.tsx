import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { colorFor, colors, radius, shadow } from '../theme';

type Tone = 'primary' | 'dark' | 'ghost' | 'soft' | 'blue' | 'red' | 'wine';

const TONES: Record<Tone, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.green, fg: '#FFFFFF' },
  dark: { bg: colors.ink, fg: '#FFFFFF' },
  ghost: { bg: colors.card, fg: colors.ink, border: '#D5D9DE' },
  soft: { bg: '#EEEFF1', fg: colors.ink },
  blue: { bg: colors.blue, fg: '#FFFFFF' },
  red: { bg: colors.red, fg: '#FFFFFF' },
  wine: { bg: colors.wine, fg: '#FFFFFF' },
};

type BtnProps = {
  label: string;
  onPress: () => void;
  tone?: Tone;
  small?: boolean;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, tone = 'primary', small, busy, disabled, style }: BtnProps) {
  const t = TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy) }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        small ? s.btnSmall : s.btn,
        { backgroundColor: t.bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        t.border ? { borderWidth: 1.5, borderColor: t.border } : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={t.fg} /> : <Text style={[small ? s.btnTextSmall : s.btnText, { color: t.fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style, tint }: { children: React.ReactNode; style?: ViewStyle; tint?: string }) {
  return <View style={[s.card, tint ? { backgroundColor: tint, boxShadow: 'none' } : null, style]}>{children}</View>;
}

export function Chip({ label, on, onPress, color = colors.ink }: { label: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[s.chip, on ? { backgroundColor: color, borderColor: color } : null]}>
      <Text style={[s.chipText, on ? { color: '#FFFFFF' } : null]}>{label}</Text>
    </Pressable>
  );
}

// Selector de dos o tres opciones, como el de los ajustes del teléfono.
export function Segment<K extends string>({ items, value, onChange }: { items: { id: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={s.segment} accessibilityRole="tablist">
      {items.map((it) => (
        <Pressable key={it.id} accessibilityRole="tab" accessibilityState={{ selected: value === it.id }} onPress={() => onChange(it.id)} style={[s.segItem, value === it.id && s.segOn]}>
          <Text style={[s.segText, value === it.id && { color: colors.ink }]}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Badge({ label, color = colors.red, soft }: { label: string; color?: string; soft?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: soft ?? color }]}>
      <Text style={[s.badgeText, { color: soft ? color : '#FFFFFF' }]}>{label}</Text>
    </View>
  );
}

export function Initial({ name, size = 40, square }: { name: string; size?: number; square?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: square ? size * 0.28 : size / 2, backgroundColor: colorFor(name), alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.42 }}>{name.trim().slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return <Text style={s.label}>{children.toUpperCase()}</Text>;
}

export function Note({ children, tint = colors.card, color = colors.muted }: { children: React.ReactNode; tint?: string; color?: string }) {
  return (
    <View style={[s.note, { backgroundColor: tint }]}>
      {typeof children === 'string' ? <Text style={[T.small, { color, fontSize: 14, lineHeight: 20 }]}>{children}</Text> : children}
    </View>
  );
}

export const T = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  kicker: { fontSize: 13, fontWeight: '600', color: colors.faint, letterSpacing: 0.4 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  small: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  strong: { fontSize: 16, fontWeight: '600', color: colors.ink },
}) as Record<'title' | 'kicker' | 'h1' | 'h2' | 'body' | 'small' | 'strong', TextStyle>;

const s = StyleSheet.create({
  btn: { minHeight: 50, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '600' },
  btnTextSmall: { fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 8, ...shadow },
  chip: { minHeight: 38, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: '#D5D9DE', backgroundColor: colors.card, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: colors.segment },
  segItem: { flex: 1, minHeight: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.card, boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.12)' },
  segText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.faint, letterSpacing: 0.5, marginTop: 6 },
  note: { borderRadius: 14, padding: 12 },
});
