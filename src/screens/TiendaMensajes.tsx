import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Chip, Initial, Label, Note, Segment, T } from '../components/ui';
import { repo } from '../lib/repo';
import { supabase } from '../lib/supabase';
import type { Me, Shop, ShopThread, TableBooking } from '../lib/types';
import { colors, hhmm } from '../theme';
import { BOOKING_STATUS, ShopChat } from './Mensajes';

const when = (iso: string) => {
  const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t.getTime()) / 86400000);
  return `${diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}, ${hhmm(iso)}`;
};

// Modo tienda > Mensajes: lo que te escriben los vecinos y, si eres restaurante, las peticiones de mesa.
export default function TiendaMensajes({ me, shop }: { me: Me; shop: Shop }) {
  const isRest = shop.tipo === 'restaurante';
  const [seg, setSeg] = useState<'chats' | 'mesas'>('chats');
  const [threads, setThreads] = useState<ShopThread[]>([]);
  const [books, setBooks] = useState<TableBooking[]>([]);
  const [open, setOpen] = useState<ShopThread | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const [t, b] = await Promise.all([repo.myShopThreads(), isRest ? repo.shopTableBookings() : Promise.resolve([])]); setThreads(t); setBooks(b); }
    catch (e: any) { Alert.alert('No se ha podido cargar', e.message); }
    finally { setLoading(false); }
  }, [isRest]);
  useEffect(() => {
    Promise.resolve().then(load);
    if (!supabase) return;
    const ch = supabase.channel('tienda-msgs-' + shop.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_threads', filter: `shop_id=eq.${shop.id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shop_messages' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_bookings', filter: `shop_id=eq.${shop.id}` }, () => load())
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [shop.id, load]);

  if (open) return <ShopChat me={me} thread={open} asShop onBack={() => { setOpen(null); load(); }} />;
  const pending = books.filter((b) => b.status === 'pendiente');

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={T.kicker}>{shop.name.toUpperCase()}</Text>
      <Text style={T.title}>Mensajes</Text>
      {isRest && <Segment items={[{ id: 'chats', label: 'Vecinos' }, { id: 'mesas', label: pending.length ? `Mesas (${pending.length})` : 'Mesas' }]} value={seg} onChange={setSeg} />}
      {(!isRest || seg === 'chats') && (
        <>
          {threads.length === 0 && !loading && <Note>Cuando un vecino te escriba desde tu ficha (un encargo, una pregunta) lo verás aquí y te llegará un aviso.</Note>}
          {threads.length > 0 && (
            <View style={st.group}>
              {threads.map((t, i) => (
                <Pressable key={t.id} accessibilityRole="button" onPress={() => setOpen(t)} style={({ pressed }) => [st.line, i > 0 && st.sep, pressed && { opacity: 0.7 }]}>
                  <Initial name={t.neighbour_name} size={42} />
                  <View style={{ flex: 1 }}><Text style={T.strong}>{t.neighbour_name}</Text><Text style={T.small} numberOfLines={1}>{t.last_text ?? 'Sin mensajes'}</Text></View>
                  <Text style={T.small}>{hhmm(t.last_at)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      {isRest && seg === 'mesas' && (
        <>
          {!shop.tables_enabled && <Note tint={colors.goldSoft} color="#8A5A12">Tienes las reservas de mesa desactivadas. Actívalas en Ajustes para que los vecinos puedan pedirte mesa.</Note>}
          {books.length === 0 && !loading && <Note>Aún no te han pedido mesa.</Note>}
          {books.map((b) => <MesaCard key={b.id} b={b} onChange={load} />)}
        </>
      )}
    </ScrollView>
  );
}

function MesaCard({ b, onChange }: { b: TableBooking; onChange: () => void }) {
  const [proposing, setProposing] = useState(false);
  const s = BOOKING_STATUS[b.status];
  const run = async (status: 'confirmada' | 'rechazada' | 'propuesta', proposedISO?: string) => {
    try { await repo.answerTable(b.id, status, proposedISO ?? null, ''); setProposing(false); onChange(); } catch (e: any) { Alert.alert('No se ha podido', e.message); }
  };
  const shift = (min: number) => new Date(new Date(b.at).getTime() + min * 60000).toISOString();
  return (
    <Card style={{ gap: 8 }}>
      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <Text style={T.h2}>Mesa para {b.party}</Text>
        <Badge label={b.status === 'pendiente' ? 'Por contestar' : s.label} color={b.status === 'pendiente' ? colors.red : s.color} soft={b.status === 'pendiente' ? colors.redSoft : s.soft} />
      </View>
      <Text style={T.body}>{when(b.at)} · {b.requester_name}{b.group_id ? ' y su grupo' : ''}</Text>
      {!!b.note && <Text style={T.small}>«{b.note}»</Text>}
      {b.status === 'propuesta' && b.proposed_at && <Text style={T.small}>Has propuesto {when(b.proposed_at)}. Esperando respuesta.</Text>}
      {b.status === 'pendiente' && !proposing && (
        <View style={st.row}>
          <Button small label="Confirmar" onPress={() => run('confirmada')} style={{ flex: 1 }} />
          <Button small label="Otra hora" tone="soft" onPress={() => setProposing(true)} />
          <Button small label="No tengo" tone="ghost" onPress={() => run('rechazada')} />
        </View>
      )}
      {proposing && (
        <View style={{ gap: 6 }}>
          <Label>Proponer</Label>
          <View style={st.row}>{[-60, -30, 30, 60, 90].map((m) => <Chip key={m} label={hhmm(shift(m))} on={false} onPress={() => run('propuesta', shift(m))} color={colors.wine} />)}</View>
          <Text style={[T.small, { color: colors.muted }]} onPress={() => setProposing(false)}>Cancelar</Text>
        </View>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
});
