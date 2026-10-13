import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, hhmm } from '../theme';
import { Button, Initial, T } from './ui';

export type ChatLine = { id: string; mine: boolean; body: string; at: string; system?: boolean; who?: string | null };

// Conversación sencilla: cabecera, burbujas y caja para escribir. La usan los chats con tiendas y los grupos.
export function ChatView({ title, subtitle, lines, onSend, onBack, right, top, note }: {
  title: string; subtitle?: string; lines: ChatLine[]; onSend: (body: string) => Promise<void>; onBack: () => void;
  right?: React.ReactNode; top?: React.ReactNode; note?: string;
}) {
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);
  const send = async () => {
    const body = text.trim(); if (!body) return;
    setText('');
    try { await onSend(body); } catch { setText(body); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={60}>
      <View style={st.head}>
        <Button small label="‹" tone="soft" onPress={onBack} />
        <Initial name={title} size={36} />
        <View style={{ flex: 1 }}><Text style={T.strong} numberOfLines={1}>{title}</Text>{!!subtitle && <Text style={T.small} numberOfLines={1}>{subtitle}</Text>}</View>
        {right}
      </View>
      {top}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 8 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {!!note && <Text style={st.sys}>{note}</Text>}
        {lines.map((m) => m.system ? (
          <Text key={m.id} style={st.sys}>{m.body}</Text>
        ) : (
          <View key={m.id} style={[st.bubble, m.mine ? st.mine : st.theirs]}>
            {!m.mine && !!m.who && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.blue }}>{m.who}</Text>}
            <Text style={{ fontSize: 16, color: m.mine ? '#FFFFFF' : colors.ink }}>{m.body}</Text>
            <Text style={{ fontSize: 11, color: m.mine ? '#DCE6F7' : colors.faint, alignSelf: 'flex-end' }}>{hhmm(m.at)}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={st.composer}>
        <TextInput value={text} onChangeText={setText} placeholder="Escribe un mensaje" accessibilityLabel="Mensaje" style={st.input} maxLength={500} multiline />
        <Button small label="Enviar" tone="blue" disabled={!text.trim()} onPress={send} />
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
  sys: { alignSelf: 'center', textAlign: 'center', fontSize: 13, color: colors.muted, backgroundColor: '#E9EAED', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16 },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.blue, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, backgroundColor: colors.bg, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: colors.ink },
});
