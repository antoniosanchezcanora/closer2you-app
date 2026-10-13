import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Notice } from '../lib/types';
import { colors, hhmm } from '../theme';

const COLOR: Record<Notice['kind'], string> = { reserva: colors.green, tienda: colors.gold, verificado: colors.green, evento: '#5B4B9A', sistema: colors.blue };

const dayLabel = (iso: string) => {
  const d = new Date(iso); const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

export default function Avisos({ onBack, onRead }: { onBack: () => void; onRead: () => void }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await repo.notices());
      await repo.markNoticesRead();
      onRead();
    } catch (e: any) {
      Alert.alert('No se han podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, [onRead]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const groups = items.reduce<{ day: string; list: Notice[] }[]>((acc, n) => {
    const d = dayLabel(n.created_at);
    const g = acc.find((x) => x.day === d);
    if (g) g.list.push(n); else acc.push({ day: d, list: [n] });
    return acc;
  }, []);

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={{ flexDirection: 'row' }}><Button small label="‹ Volver" tone="soft" onPress={onBack} /></View>
      <Text style={T.title}>Avisos</Text>
      {items.length === 0 && !loading && <Note>No tienes avisos. Aquí te contamos cuándo está lista tu reserva o cuándo te verifican.</Note>}
      {groups.map((g) => (
        <View key={g.day} style={{ gap: 6 }}>
          <Label>{g.day}</Label>
          <View style={st.group}>
            {g.list.map((n, i) => (
              <View key={n.id} style={[st.row, i > 0 && st.sep]}>
                <View style={[st.dot, { backgroundColor: COLOR[n.kind] }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[T.strong, !n.read_at && { color: colors.ink }]}>{n.title}</Text>
                  {!!n.body && <Text style={T.small}>{n.body}</Text>}
                </View>
                <Text style={T.small}>{hhmm(n.created_at)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <Note>Los avisos al móvil con la app cerrada llegarán con la versión instalable de Stoop.</Note>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
