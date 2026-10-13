import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Chip, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { BarrioEvent, EventCategory, Me, Shop } from '../lib/types';
import { colors, hhmm } from '../theme';

const PURPLE = '#5B4B9A';
const CATS: { id: EventCategory; label: string; color: string; soft: string }[] = [
  { id: 'deporte', label: 'Deporte', color: PURPLE, soft: '#ECE8F7' },
  { id: 'cultura', label: 'Cultura', color: '#22344F', soft: colors.blueSoft },
  { id: 'ninos', label: 'Niños', color: colors.gold, soft: colors.goldSoft },
  { id: 'mayores', label: 'Mayores', color: colors.red, soft: colors.redSoft },
  { id: 'barrio', label: 'Barrio', color: colors.green, soft: colors.greenSoft },
];
const cat = (id: EventCategory) => CATS.find((c) => c.id === id)!;
const DIA = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();
const NUM = (iso: string) => new Date(iso).getDate();
const largo = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Agenda({ me, shop }: { me: Me | null; shop: Shop | null }) {
  const [list, setList] = useState<BarrioEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<EventCategory | 'todo'>('todo');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setList(await repo.events()); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const toggle = async (e: BarrioEvent) => {
    setBusy(true);
    try { if (e.me_going) await repo.leaveEvent(e.id); else await repo.joinEvent(e.id); await load(); }
    catch (err: any) { Alert.alert('No se ha podido', err.message); }
    finally { setBusy(false); }
  };

  if (!me?.verified) return <Note>Cuando una tienda te verifique, verás la agenda del barrio y podrás apuntarte.</Note>;
  if (creating) return <CrearEvento shop={shop} onDone={() => { setCreating(false); load(); }} />;

  const ev = open ? list.find((e) => e.id === open) : null;
  if (ev) {
    const c = cat(ev.category);
    const full = !!ev.capacity && ev.going >= ev.capacity && !ev.me_going;
    return (
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row' }}><Button small label="‹ Agenda" tone="soft" onPress={() => setOpen(null)} /></View>
        <Card style={{ gap: 8 }}>
          <Badge label={c.label} color={c.color} soft={c.soft} />
          <Text style={T.h1}>{ev.title}</Text>
          <Text style={T.body}>{largo(ev.starts_at)} · {hhmm(ev.starts_at)}</Text>
          <Text style={T.small}>{ev.place} · {ev.price_text}</Text>
          {ev.capacity
            ? <><Text style={T.strong}>{ev.going} de {ev.capacity} apuntados{ev.capacity - ev.going > 0 ? ` · quedan ${ev.capacity - ev.going}` : ' · completo'}</Text>
                <View style={st.bar}><View style={[st.fill, { width: `${Math.min(100, (ev.going / ev.capacity) * 100)}%`, backgroundColor: c.color }]} /></View></>
            : <Text style={T.strong}>{ev.going} {ev.going === 1 ? 'vecino va' : 'vecinos van'}</Text>}
          {!!ev.description && <Text style={[T.body, { color: '#3D434A' }]}>{ev.description}</Text>}
          <Text style={T.small}>Organiza {ev.shop_name ?? 'un vecino verificado'}{ev.kids ? ' · los monitores tienen el certificado de delitos sexuales' : ''}</Text>
        </Card>
        <Button label={ev.me_going ? 'Ya no voy' : full ? 'Completo' : 'Me apunto'} tone={ev.me_going ? 'ghost' : 'dark'} disabled={full} busy={busy} onPress={() => toggle(ev)} />
        {ev.creator_id === me.id && <Button label="Cancelar el evento" tone="ghost" onPress={() => Alert.alert('Cancelar el evento', 'Dejará de verse en la agenda.', [{ text: 'No', style: 'cancel' }, { text: 'Cancelar evento', style: 'destructive', onPress: async () => { await repo.cancelEvent(ev.id); setOpen(null); load(); } }])} />}
        <Text style={[T.small, { textAlign: 'center' }]}>Si se cobra algo, se paga al organizador, nunca en la app.</Text>
      </View>
    );
  }

  const shown = list.filter((e) => filtro === 'todo' || e.category === filtro);
  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Todo" on={filtro === 'todo'} onPress={() => setFiltro('todo')} />
        {CATS.map((c) => <Chip key={c.id} label={c.label} on={filtro === c.id} onPress={() => setFiltro(c.id)} color={c.color} />)}
      </ScrollView>
      {shown.length === 0 && !loading && <Note>No hay planes a la vista. Crea el primero: un partido, una charla, un paseo.</Note>}
      {shown.length > 0 && (
        <View style={st.group}>
          {shown.map((e, i) => {
            const c = cat(e.category);
            return (
              <Pressable key={e.id} accessibilityRole="button" onPress={() => setOpen(e.id)} style={({ pressed }) => [st.row, i > 0 && st.sep, pressed && { opacity: 0.7 }]}>
                <View style={[st.date, { backgroundColor: c.soft }]}><Text style={[st.dateDay, { color: c.color }]}>{DIA(e.starts_at)}</Text><Text style={[st.dateNum, { color: c.color }]}>{NUM(e.starts_at)}</Text></View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={T.strong}>{e.title}</Text>
                  <Text style={T.small}>{hhmm(e.starts_at)} · {e.place} · {e.price_text}</Text>
                  <Text style={[T.small, { color: c.color, fontWeight: '600' }]}>{e.capacity ? `${e.going} de ${e.capacity}` : `${e.going} van`}{e.me_going ? ' · tú vas' : ''}</Text>
                </View>
                <Text style={{ color: colors.faint, fontSize: 18 }}>›</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Button label="Crear un evento" tone="dark" onPress={() => setCreating(true)} />
    </View>
  );
}

const isPast = (d: Date) => d.getTime() < Date.now();
const nextDays = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d; });
const HORAS = ['10:00', '11:00', '12:00', '17:00', '18:00', '19:00', '20:00', '21:30'];

function CrearEvento({ shop, onDone }: { shop: Shop | null; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('barrio');
  const [day, setDay] = useState(1);
  const [hora, setHora] = useState('19:00');
  const [place, setPlace] = useState('');
  const [capacity, setCapacity] = useState(0);
  const [price, setPrice] = useState('Gratis');
  const [description, setDescription] = useState('');
  const [kids, setKids] = useState(false);
  const [cert, setCert] = useState(false);
  const [asShop, setAsShop] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = nextDays();

  const save = async () => {
    const d = new Date(days[day]); const [h, m] = hora.split(':').map(Number); d.setHours(h, m, 0, 0);
    if (title.trim().length < 2 || place.trim().length < 2) { Alert.alert('Falta algo', 'Pon qué es y dónde.'); return; }
    if (isPast(d)) { Alert.alert('Hora pasada', 'Elige una hora que no haya pasado.'); return; }
    if (kids && !cert) { Alert.alert('Con niños', 'Confirma que quienes estén con los niños tienen el certificado negativo de delitos sexuales.'); return; }
    setBusy(true);
    try {
      await repo.createEvent({ title: title.trim(), category, starts_at: d.toISOString(), place: place.trim(), capacity: capacity || null, price_text: price.trim() || 'Gratis', description: description.trim() || null, kids, kids_certified: kids && cert, shop_id: asShop && shop ? shop.id : null });
      onDone();
    } catch (e: any) {
      Alert.alert('No se ha podido publicar', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={T.h1}>Crear un evento</Text>
        <Button small label="Cancelar" tone="soft" onPress={onDone} />
      </View>
      <TextInput value={title} onChangeText={setTitle} placeholder="Qué es: partido de fútbol 7, castañas..." accessibilityLabel="Qué es" style={st.input} maxLength={80} />
      <Label>Tipo</Label>
      <View style={st.wrap}>{CATS.map((c) => <Chip key={c.id} label={c.label} on={category === c.id} onPress={() => { setCategory(c.id); if (c.id === 'ninos') setKids(true); }} color={c.color} />)}</View>
      <Label>Cuándo</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d, i) => <Chip key={i} label={i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })} on={day === i} onPress={() => setDay(i)} color={PURPLE} />)}
      </ScrollView>
      <View style={st.wrap}>{HORAS.map((h) => <Chip key={h} label={h} on={hora === h} onPress={() => setHora(h)} color={PURPLE} />)}</View>
      <Label>Dónde</Label>
      <TextInput value={place} onChangeText={setPlace} placeholder="Pista del parque, Librería La Esquina..." accessibilityLabel="Dónde" style={st.input} maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Plazas</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Button small label="−" tone="soft" onPress={() => setCapacity(Math.max(0, capacity - 1))} />
            <Text style={st.qty}>{capacity || 'Sin límite'}</Text>
            <Button small label="+" tone="soft" onPress={() => setCapacity(Math.min(500, capacity + 1))} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Precio</Text>
          <TextInput value={price} onChangeText={setPrice} accessibilityLabel="Precio" style={st.input} maxLength={40} />
        </View>
      </View>
      <TextInput value={description} onChangeText={setDescription} placeholder="Cuéntalo en dos líneas" accessibilityLabel="Descripción" style={[st.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]} multiline maxLength={500} />
      <View style={st.card}>
        <View style={st.line}>
          <Text style={[T.body, { flex: 1 }]}>Es para niños o van niños</Text>
          <Switch value={kids} onValueChange={(v) => { setKids(v); if (!v) setCert(false); }} accessibilityLabel="Hay niños" />
        </View>
        {kids && (
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: cert }} onPress={() => setCert(!cert)} style={[st.line, { marginTop: 8 }]}>
            <View style={[st.check, cert && { backgroundColor: colors.green, borderColor: colors.green }]}>{cert && <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}</View>
            <Text style={[T.small, { flex: 1 }]}>Quienes estarán con los niños tienen el certificado negativo del Registro Central de Delincuentes Sexuales, como exige la ley de protección de la infancia.</Text>
          </Pressable>
        )}
        {shop && (
          <View style={[st.line, { marginTop: 8 }]}>
            <Text style={[T.body, { flex: 1 }]}>Lo organiza {shop.name}</Text>
            <Switch value={asShop} onValueChange={setAsShop} accessibilityLabel="Lo organiza mi tienda" />
          </View>
        )}
      </View>
      <Button label="Publicar evento" tone="dark" busy={busy} onPress={save} />
      <Text style={[T.small, { textAlign: 'center' }]}>Lo ven los vecinos verificados. Si se cobra algo, se paga fuera de la app.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  date: { width: 50, borderRadius: 12, alignItems: 'center', paddingVertical: 6 },
  dateDay: { fontSize: 11, fontWeight: '700' },
  dateNum: { fontSize: 20, fontWeight: '700' },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#EEEFF1', overflow: 'hidden' },
  fill: { height: '100%' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  qty: { minWidth: 70, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: '#B8BDC4', alignItems: 'center', justifyContent: 'center' },
});
