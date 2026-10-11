import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

type BtnProps = {
  label: string;
  onPress: () => void;
  tone?: 'yellow' | 'mint' | 'white' | 'ghost';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, tone = 'yellow', busy, disabled, style }: BtnProps) {
  const bg = tone === 'yellow' ? colors.yellow : tone === 'mint' ? colors.mint : colors.card;
  const border = tone === 'ghost' ? colors.line : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy) }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={[s.btnText, tone === 'ghost' && { color: colors.muted, fontWeight: '700' }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style, strong }: { children: React.ReactNode; style?: ViewStyle; strong?: boolean }) {
  return <View style={[s.card, { borderColor: strong ? colors.ink : colors.line }, style]}>{children}</View>;
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[s.chip, on ? s.chipOn : null]}>
      <Text style={[s.chipText, on ? { color: colors.bg } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, bg, color }: { label: string; bg: string; color?: string }) {
  return (
    <View style={[s.tag, { backgroundColor: bg }]}>
      <Text style={[s.tagText, color ? { color } : null]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, bg }: { name: string; bg: string }) {
  return (
    <View style={[s.avatar, { backgroundColor: bg }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={s.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export const T = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', color: colors.ink },
  h2: { fontSize: 16, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  strong: { fontSize: 15, fontWeight: '800', color: colors.ink },
}) as Record<'h1' | 'h2' | 'body' | 'small' | 'strong', TextStyle>;

const s = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 16, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '800', color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 2, padding: 12, gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontSize: 14, fontWeight: '800', color: colors.ink },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  tagText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800', color: colors.ink },
});
