import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChatView } from '../components/ChatView';
import { Badge, Button, Card, Chip, Initial, Label, Note, Segment, T } from '../components/ui';
import { repo } from '../lib/repo';
import { supabase } from '../lib/supabase';
import type { ChatGroup, Conversation, GroupMessage, Me, Person, Shop, ShopMessage, ShopThread, TableBooking } from '../lib/types';
import { colors, hhmm } from '../theme';
import { Chat, VecinoChats } from './Vecinos';

const nowMs = () => Date.now();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t.getTime()) / 86400000);
  const when = diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  return `${when} a las ${hhmm(iso)}`;
};
export const BOOKING_STATUS: Record<TableBooking['status'], { label: string; color: string; soft: string }> = {
  pendiente: { label: 'Esperando al restaurante', color: colors.gold, soft: colors.goldSoft },
  confirmada: { label: 'Confirmada', color: colors.green, soft: colors.greenSoft },
  propuesta: { label: 'Te proponen otra hora', color: colors.blue, soft: colors.blueSoft },
  rechazada: { label: 'Sin mesa', color: colors.muted, soft: '#EEEFF1' },
  cancelada: { label: 'Cancelada', color: colors.muted, soft: '#EEEFF1' },
};

// Pestaña Mensajes: vecinos, grupos y tiendas, cada uno por su lado.
export default function Mensajes({ me, openConv, openThread, onConsumed }: { me: Me; openConv?: Conversation | null; openThread?: ShopThread | null; onConsumed?: () => void }) {
  const fase2 = me.fase2 && me.verified;
  const [seg, setSeg] = useState<'vecinos' | 'grupos' | 'tiendas'>(openThread ? 'tiendas' : fase2 ? 'vecinos' : 'tiendas');
  const [conv, setConv] = useState<Conversation | null>(openConv ?? null);
  const [thread, setThread] = useState<ShopThread | null>(openThread ?? null);
  const [group, setGroup] = useState<ChatGroup | null>(null);
  useEffect(() => {
    if (!openConv && !openThread) return;
    Promise.resolve().then(() => {
      if (openConv) { setSeg('vecinos'); setConv(openConv); }
      if (openThread) { setSeg('tiendas'); setThread(openThread); }
      onConsumed?.();
    });
  }, [openConv, openThread, onConsumed]);

  if (conv) return <Chat me={me} conv={conv} onBack={() => setConv(null)} />;
  if (thread) return <ShopChat me={me} thread={thread} asShop={false} onBack={() => setThread(null)} />;
  if (group) return <GroupChat me={me} group={group} onBack={() => setGroup(null)} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 6, gap: 8 }}>
        <Text style={T.title}>Mensajes</Text>
        <Segment items={fase2 ? [{ id: 'vecinos', label: 'Vecinos' }, { id: 'grupos', label: 'Grupos' }, { id: 'tiendas', label: 'Tiendas' }] : [{ id: 'tiendas', label: 'Tiendas' }]} value={seg} onChange={setSeg} />
      </View>
      {seg === 'vecinos' && fase2 && <VecinoChats onOpen={setConv} />}
      {seg === 'grupos' && fase2 && <Grupos onOpen={setGroup} />}
      {seg === 'tiendas' && <TiendasChats onOpen={setThread} />}
    </View>
  );
}

// ------------------------------------------------------------------
function TiendasChats({ onOpen }: { onOpen: (t: ShopThread) => void }) {
  const [list, setList] = useState<ShopThread[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setList(await repo.shopThreads()); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);
  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {list.length === 0 && !loading && <Note>Escribe a cualquier tienda desde su ficha, con «Escribir a la tienda»: para encargos, para preguntar si le queda algo o para pedir mesa.</Note>}
      {list.length > 0 && (
        <View style={st.group}>
          {list.map((t, i) => (
            <Pressable key={t.id} accessibilityRole="button" onPress={() => onOpen(t)} style={({ pressed }) => [st.line, i > 0 && st.sep, pressed && { opacity: 0.7 }]}>
              <Initial name={t.shop_name} size={42} square />
              <View style={{ flex: 1 }}><Text style={T.strong}>{t.shop_name}</Text><Text style={T.small} numberOfLines={1}>{t.last_text ?? 'Escribe tu primer mensaje'}</Text></View>
              <Text style={T.small}>{hhmm(t.last_at)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Note>La tienda contesta cuando puede, normalmente en horario de apertura. Si es urgente, llama o pásate.</Note>
    </ScrollView>
  );
}

// Chat vecino y tienda. Lo usan los dos lados: el vecino (asShop=false) y la tienda en su modo tienda (asShop=true).
export function ShopChat({ me, thread, asShop, onBack }: { me: Me; thread: ShopThread; asShop: boolean; onBack: () => void }) {
  const [msgs, setMsgs] = useState<ShopMessage[]>([]);
  const load = useCallback(async () => { try { setMsgs(await repo.shopMessages(thread.id)); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); } }, [thread.id]);
  useEffect(() => {
    Promise.resolve().then(load);
    if (!supabase) return;
    const ch = supabase.channel('shopchat-' + thread.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shop_messages', filter: `thread_id=eq.${thread.id}` }, () => load()).subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [thread.id, load]);
  return (
    <ChatView
      title={asShop ? thread.neighbour_name : thread.shop_name}
      subtitle={asShop ? `Vecino verificado · escribe a ${thread.shop_name}` : 'Tienda del barrio'}
      lines={msgs.map((m) => ({ id: m.id, mine: asShop ? m.from_shop : !m.from_shop && m.sender_id === me.id, body: m.body, at: m.created_at }))}
      onSend={async (b) => { await repo.sendShopMessage(thread.id, b); await load(); }}
      onBack={onBack}
      note={asShop ? 'Contestas como la tienda. El vecino ve el nombre de la tienda, no el tuyo.' : 'Para encargos y preguntas. Pagas en la tienda, nunca en la app.'}
    />
  );
}

// ------------------------------------------------------------------
function Grupos({ onOpen }: { onOpen: (g: ChatGroup) => void }) {
  const [list, setList] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    try { setList(await repo.groups()); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);
  if (creating) return <NuevoGrupo onCancel={() => setCreating(false)} onDone={(g) => { setCreating(false); load(); onOpen(g); }} />;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {list.length === 0 && !loading && <Note>Haz un grupo con varios de tu gente: «Cañas del jueves», «Cena del sábado». Desde el grupo podéis pedir mesa a un restaurante del barrio.</Note>}
        {list.length > 0 && (
          <View style={st.group}>
            {list.map((g, i) => (
              <Pressable key={g.id} accessibilityRole="button" onPress={() => onOpen(g)} style={({ pressed }) => [st.line, i > 0 && st.sep, pressed && { opacity: 0.7 }]}>
                <Initial name={g.name} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={T.strong}>{g.name}</Text>
                  <Text style={T.small} numberOfLines={1}>{g.last_text ?? g.members.map((m) => m.name).join(', ')}</Text>
                </View>
                <Text style={T.small}>{hhmm(g.last_at)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ height: 70 }} />
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={st.fab}><Text style={st.fabText}>+ Nuevo grupo</Text></Pressable>
    </View>
  );
}

function NuevoGrupo({ onCancel, onDone }: { onCancel: () => void; onDone: (g: ChatGroup) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { repo.people().then((p) => setPeople(p.filter((x) => x.status === 'aceptada'))).catch(() => {}); }, []);
  const create = async () => {
    setBusy(true);
    try { onDone(await repo.createGroup(name.trim(), sel)); } catch (e: any) { Alert.alert('No se ha podido', e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={T.h1}>Nuevo grupo</Text><Button small label="Cancelar" tone="soft" onPress={onCancel} /></View>
      <TextInput value={name} onChangeText={setName} placeholder="Nombre: Cañas del jueves" maxLength={40} style={st.input} accessibilityLabel="Nombre del grupo" />
      <View style={st.row}>{['Cañas del jueves', 'Cena del sábado', 'Vecinos del 3º'].map((s) => <Chip key={s} label={s} on={name === s} onPress={() => setName(s)} color={colors.blue} />)}</View>
      <Label>¿Quién viene?</Label>
      {people.length === 0 && <Note>Primero añade gente a Mi gente. Solo puedes hacer grupos con tu círculo.</Note>}
      <View style={st.group}>
        {people.map((p, i) => {
          const on = sel.includes(p.other_id);
          return (
            <Pressable key={p.other_id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setSel(on ? sel.filter((x) => x !== p.other_id) : [...sel, p.other_id])} style={[st.line, i > 0 && st.sep]}>
              <Initial name={p.name} size={38} />
              <Text style={[T.strong, { flex: 1 }]}>{p.name}</Text>
              <View style={[st.box, on && { backgroundColor: colors.blue, borderColor: colors.blue }]}>{on && <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}</View>
            </Pressable>
          );
        })}
      </View>
      <Button label="Crear grupo" tone="blue" busy={busy} disabled={name.trim().length < 2 || sel.length === 0} onPress={create} />
    </ScrollView>
  );
}

function GroupChat({ me, group, onBack }: { me: Me; group: ChatGroup; onBack: () => void }) {
  const [msgs, setMsgs] = useState<GroupMessage[]>([]);
  const [books, setBooks] = useState<TableBooking[]>([]);
  const [booking, setBooking] = useState(false);
  const load = useCallback(async () => {
    try { const [m, b] = await Promise.all([repo.groupMessages(group.id), repo.tableBookings(group.id)]); setMsgs(m); setBooks(b); }
    catch (e: any) { Alert.alert('No se ha podido cargar', e.message); }
  }, [group.id]);
  useEffect(() => {
    Promise.resolve().then(load);
    if (!supabase) return;
    const ch = supabase.channel('group-' + group.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_bookings', filter: `group_id=eq.${group.id}` }, () => load())
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [group.id, load]);

  if (booking) return <ReservarMesa me={me} group={group} onDone={() => { setBooking(false); load(); }} />;
  const active = books.filter((b) => b.status !== 'cancelada' && b.status !== 'rechazada' && new Date(b.at).getTime() > nowMs() - 3 * 3600000);
  const menu = () => Alert.alert(group.name, group.members.map((m) => m.name).join(', '), [
    { text: 'Salir del grupo', style: 'destructive', onPress: async () => { try { await repo.leaveGroup(group.id); onBack(); } catch (e: any) { Alert.alert('No se ha podido', e.message); } } },
    { text: 'Cerrar', style: 'cancel' },
  ]);
  return (
    <ChatView
      title={group.name}
      subtitle={`Tú, ${group.members.map((m) => m.name).join(', ')}`}
      lines={msgs.map((m) => ({ id: m.id, mine: m.sender_id === me.id && m.kind === 'texto', body: m.body, at: m.created_at, system: m.kind === 'sistema', who: m.sender_name }))}
      onSend={async (b) => { await repo.sendGroupMessage(group.id, b); await load(); }}
      onBack={onBack}
      right={<Button small label="···" tone="soft" onPress={menu} />}
      top={
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
          {active.map((b) => <BookingCard key={b.id} b={b} me={me} onChange={load} />)}
          <Button small label="🍽  Pedir mesa en un restaurante" tone="soft" onPress={() => setBooking(true)} />
        </View>
      }
    />
  );
}

export function BookingCard({ b, me, onChange }: { b: TableBooking; me: Me; onChange: () => void }) {
  const s = BOOKING_STATUS[b.status];
  const mine = b.requester_id === me.id;
  const run = async (status: 'confirmada' | 'cancelada') => { try { await repo.answerTable(b.id, status); onChange(); } catch (e: any) { Alert.alert('No se ha podido', e.message); } };
  return (
    <Card style={{ gap: 6, paddingVertical: 10 }}>
      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <Text style={T.strong}>{b.shop_name} · {b.party} {b.party === 1 ? 'persona' : 'personas'}</Text>
        <Badge label={s.label} color={s.color} soft={s.soft} />
      </View>
      <Text style={T.small}>{b.status === 'propuesta' && b.proposed_at ? `Pediste ${dayLabel(b.at)}. Proponen ${dayLabel(b.proposed_at)}.` : dayLabel(b.at)}{b.shop_note ? ` · «${b.shop_note}»` : ''}</Text>
      {mine && b.status === 'propuesta' && (
        <View style={st.row}>
          <Button small label="Me vale esa hora" onPress={() => run('confirmada')} style={{ flex: 1 }} />
          <Button small label="Cancelar" tone="ghost" onPress={() => run('cancelada')} />
        </View>
      )}
      {mine && (b.status === 'pendiente' || b.status === 'confirmada') && <Text style={[T.small, { color: colors.red }]} onPress={() => run('cancelada')}>Cancelar la reserva</Text>}
    </Card>
  );
}

function ReservarMesa({ me, group, onDone }: { me: Me; group: ChatGroup | null; onDone: () => void }) {
  const [places, setPlaces] = useState<Shop[]>([]);
  const [follows, setFollows] = useState<string[]>([]);
  const [shopId, setShopId] = useState<string | null>(null);
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('21:00');
  const [party, setParty] = useState((group?.members.length ?? 0) + 1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([repo.shops(), repo.follows().catch(() => [] as string[])]).then(([s, f]) => {
      const r = s.filter((x) => x.tipo === 'restaurante' && x.tables_enabled).sort((a, b) => Number(f.includes(b.id)) - Number(f.includes(a.id)));
      setPlaces(r); setFollows(f); if (r[0]) setShopId(r[0].id);
    }).catch(() => {});
  }, []);
  const shop = places.find((p) => p.id === shopId);
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => { const x = new Date(); x.setDate(x.getDate() + d); return { d, label: d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : x.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }) }; });
  const send = async () => {
    if (!shopId) return;
    const [h, m] = time.split(':').map(Number);
    const at = new Date(); at.setDate(at.getDate() + day); at.setHours(h, m, 0, 0);
    setBusy(true);
    try { await repo.requestTable(shopId, group?.id ?? null, party, at.toISOString(), note); Alert.alert('Pedido', `${shop?.name} te contestará en la app.${group ? ' El grupo lo verá.' : ''}`); onDone(); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
    finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={T.h1}>Pedir mesa</Text><Button small label="Cancelar" tone="soft" onPress={onDone} /></View>
      {places.length === 0 && <Note>Todavía no hay restaurantes del barrio que acepten reservas en la app.</Note>}
      <Label>Dónde</Label>
      <View style={st.row}>{places.map((p) => <Chip key={p.id} label={`${p.name}${follows.includes(p.id) ? ' ★' : ''}`} on={shopId === p.id} onPress={() => setShopId(p.id)} color={colors.wine} />)}</View>
      <Label>Qué día</Label>
      <View style={st.row}>{days.map((d) => <Chip key={d.d} label={d.label} on={day === d.d} onPress={() => setDay(d.d)} color={colors.wine} />)}</View>
      <Label>A qué hora</Label>
      <View style={st.row}>{['13:30', '14:00', '14:30', '15:00', '20:30', '21:00', '21:30', '22:00'].map((t) => <Chip key={t} label={t} on={time === t} onPress={() => setTime(t)} color={colors.wine} />)}</View>
      <Label>Cuántos</Label>
      <View style={st.row}>
        <Button small label="−" tone="soft" onPress={() => setParty(Math.max(1, party - 1))} />
        <Text style={[T.h1, { minWidth: 40, textAlign: 'center' }]}>{party}</Text>
        <Button small label="+" tone="soft" onPress={() => setParty(Math.min(shop?.tables_max_party ?? 10, party + 1))} />
        {shop && <Text style={T.small}>Hasta {shop.tables_max_party}</Text>}
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="Algo que deba saber (terraza, trona, alergias…)" maxLength={200} style={st.input} accessibilityLabel="Nota para el restaurante" />
      <Button label="Pedir mesa" tone="wine" busy={busy} disabled={!shopId} onPress={send} />
      <Note>No se paga nada en la app. Si no podéis ir, cancélala aquí para que el bar libere la mesa.</Note>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: '#B8BDC4', alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.ink, boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.2)' },
  fabText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
