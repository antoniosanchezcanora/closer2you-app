import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Chip, Initial, Label, Note, T } from '../components/ui';
import { WalkMap } from '../components/WalkMap';
import { repo } from '../lib/repo';
import { supabase } from '../lib/supabase';
import type { CareAlert, Me, MyPresence, Person, Walk } from '../lib/types';
import { colorFor, colors, hhmm } from '../theme';

// Fuera del render: la hora actual (la regla de pureza de React no deja llamar a Date.now() dentro).
const nowMs = () => Date.now();
const minsAgo = (iso: string) => Math.max(0, Math.round((nowMs() - new Date(iso).getTime()) / 60000));
const agoText = (iso: string) => { const m = minsAgo(iso); return m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
const isToday = (iso: string | null) => !!iso && new Date(iso).toDateString() === new Date(nowMs()).toDateString();
const call112 = () => Linking.openURL('tel:112').catch(() => Alert.alert('Llama al 112', 'Marca 112 desde el teléfono.'));
const openMap = (lat: number, lng: number, name: string) => {
  const url = Platform.OS === 'ios' ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  Linking.openURL(url).catch(() => Alert.alert('No se ha podido abrir el mapa'));
};

function Btn112({ big }: { big?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Llamar al 112" onPress={call112} style={[st.b112, big && { minHeight: 58 }]}>
      <Text style={[st.b112Text, big && { fontSize: 19 }]}>Llamar al 112</Text>
    </Pressable>
  );
}

// Vecinos > Mi gente: el círculo de confianza y todo lo de cuidarnos.
export default function MiGente({ me }: { me: Me }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [alerts, setAlerts] = useState<CareAlert[]>([]);
  const [walks, setWalks] = useState<Walk[]>([]);
  const [presence, setPresence] = useState<MyPresence>({ last_ok_at: null, awake_until: null });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [goingHome, setGoingHome] = useState(false);
  const [, setTick] = useState(0);
  // Recorrido visto mientras miras la pantalla (solo en este móvil, no se guarda)
  const [trails, setTrails] = useState<Record<string, { lat: number; lng: number }[]>>({});

  const applyWalks = useCallback((w: Walk[]) => {
    setWalks(w);
    setTrails((prev) => {
      const next: Record<string, { lat: number; lng: number }[]> = {};
      w.forEach((x) => {
        const t = prev[x.id] ?? [];
        if (x.lat != null && x.lng != null) {
          const last = t[t.length - 1];
          next[x.id] = last && last.lat === x.lat && last.lng === x.lng ? t : [...t, { lat: x.lat, lng: x.lng }].slice(-300);
        } else next[x.id] = t;
      });
      return next;
    });
  }, []);
  const refreshWalks = useCallback(async () => {
    try { applyWalks(await repo.walks()); } catch { /* se reintenta en el siguiente ciclo */ }
  }, [applyWalks]);

  const load = useCallback(async () => {
    try {
      const [p, a, w, pr] = await Promise.all([repo.people(), repo.careAlerts(), repo.walks(), repo.myPresence()]);
      setPeople(p); setAlerts(a); setPresence(pr); applyWalks(w);
    } catch (e: any) {
      Alert.alert('No se ha podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, [applyWalks]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  // Al momento mientras la app está abierta: avisos de ayuda, vueltas a casa e invitaciones.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    if (!supabase) return () => clearInterval(t);
    const ch = supabase.channel('migente')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'care_alerts' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'walks' }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'walks' }, () => refreshWalks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trust_links' }, () => load())
      .subscribe();
    return () => { clearInterval(t); supabase?.removeChannel(ch); };
  }, [load, refreshWalks]);

  // Mientras alguien vuelve a casa, la posición se pide cada 4 segundos además del aviso en vivo,
  // por si la conexión en tiempo real se corta (pasa al cambiar de wifi a datos).
  const following = walks.some((w) => w.status === 'activa');
  useEffect(() => {
    if (!following) return;
    const t = setInterval(refreshWalks, 4000);
    return () => clearInterval(t);
  }, [following, refreshWalks]);

  const run = async (f: () => Promise<void>, ok?: string) => {
    try { await f(); if (ok) Alert.alert(ok); load(); } catch (e: any) { Alert.alert('No se ha podido', e.message); }
  };

  const myWalk = walks.find((w) => w.user_id === me.id && w.status === 'activa') ?? null;
  if (goingHome || myWalk) return <VueltaCasa me={me} walk={myWalk} people={people} onClose={() => { setGoingHome(false); load(); }} />;

  const accepted = people.filter((p) => p.status === 'aceptada');
  const incoming = people.filter((p) => p.status === 'pendiente' && !p.i_sent);
  const sent = people.filter((p) => p.status === 'pendiente' && p.i_sent);
  const myAlert = alerts.find((a) => a.user_id === me.id) ?? null;
  const theirAlerts = alerts.filter((a) => a.user_id !== me.id);
  const theirWalks = walks.filter((w) => w.user_id !== me.id);
  const awake = !!presence.awake_until && new Date(presence.awake_until).getTime() > nowMs();
  const cuidadoCount = accepted.filter((p) => p.i_share_cuidado).length;

  const askHelp = () => {
    if (cuidadoCount === 0) { Alert.alert('Aún no tienes a quién avisar', 'Añade a alguien a tu gente y deja activado «Recibe mis avisos de ayuda». Si es una urgencia, llama al 112.'); return; }
    Alert.alert('Pedir ayuda ahora', `Avisamos a ${cuidadoCount} ${cuidadoCount === 1 ? 'persona' : 'personas'} de tu gente. Si es una urgencia, llama al 112.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Avisar', style: 'destructive', onPress: () => run(() => repo.askHelp()) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {theirAlerts.map((a) => (
        <Card key={a.id} tint={colors.red} style={{ gap: 10 }}>
          <Text style={[T.h1, { color: '#FFFFFF' }]}>{a.user_name} necesita ayuda</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 15 }}>Lo ha pedido {agoText(a.created_at)}.{a.responder_name ? ` ${a.responder_name} va para allá.` : ' Todavía no va nadie.'}</Text>
          {a.my_answer === 'voy' ? (
            <>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Has dicho que vas.</Text>
              <Button label="Ya está, todo bien" tone="ghost" onPress={() => run(() => repo.closeHelp(a.id))} />
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <Button label="Voy yo" tone="dark" onPress={() => run(() => repo.respondHelp(a.id, true))} />
              {a.my_answer !== 'no_puedo' && <Button label="No puedo ahora" tone="ghost" onPress={() => run(() => repo.respondHelp(a.id, false))} />}
            </View>
          )}
          <Btn112 />
        </Card>
      ))}

      {myAlert && (
        <Card tint={colors.redSoft} style={{ gap: 8 }}>
          <Text style={[T.h2, { color: colors.red }]}>Has pedido ayuda {agoText(myAlert.created_at)}</Text>
          <Text style={T.body}>{myAlert.responder_name ? `${myAlert.responder_name} va para allá.` : 'Hemos avisado a tu gente. Te decimos aquí quién va.'}</Text>
          <Btn112 big />
          <Button label="Ya estoy bien, cerrar el aviso" tone="ghost" onPress={() => run(() => repo.closeHelp(myAlert.id))} />
        </Card>
      )}

      {theirWalks.map((w) => {
        const late = new Date(w.eta_at).getTime() < nowMs();
        return (
          <Card key={w.id} tint={late ? colors.goldSoft : colors.blueSoft} style={{ gap: 6 }}>
            <View style={st.row}>
              <Initial name={w.user_name} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={T.h2}>{w.user_name} vuelve a casa</Text>
                <Text style={T.small}>Debería llegar sobre las {hhmm(w.eta_at)}{w.pos_at ? ` · posición ${agoText(w.pos_at)}` : ' · sin ubicación'}</Text>
              </View>
            </View>
            {late && <Text style={[T.body, { color: '#8A5A12', fontWeight: '600' }]}>Va con {minsAgo(w.eta_at)} min de retraso. Llámale para ver si todo va bien.</Text>}
            {w.lat != null && w.lng != null && (
              <>
                <WalkMap points={[{ id: w.id, lat: w.lat, lng: w.lng, name: w.user_name, color: colorFor(w.user_name), trail: trails[w.id] }]} />
                <Button small label="Abrir en Mapas" tone="soft" onPress={() => openMap(w.lat!, w.lng!, w.user_name)} />
              </>
            )}
          </Card>
        );
      })}

      <Card style={{ gap: 10 }}>
        <Text style={T.h2}>¿Cómo estás?</Text>
        <View style={st.row}>
          <Pressable accessibilityRole="button" onPress={() => run(() => repo.imOk())} style={[st.big, { borderColor: colors.green }]}>
            <Text style={[st.bigT, { color: colors.green }]}>Estoy bien</Text>
            <Text style={T.small}>{isToday(presence.last_ok_at) ? `Avisado a las ${hhmm(presence.last_ok_at!)}` : 'Tu gente lo verá'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={askHelp} style={[st.big, { backgroundColor: colors.red, borderColor: colors.red }]}>
            <Text style={[st.bigT, { color: '#FFFFFF' }]}>Necesito ayuda</Text>
            <Text style={[T.small, { color: '#FFE3E3' }]}>Avisa a tu gente</Text>
          </Pressable>
        </View>
        <Button label="Vuelvo a casa" tone="blue" onPress={() => setGoingHome(true)} />
        <Btn112 />
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={T.h2}>Estoy despierto</Text>
        <Text style={T.small}>Tu gente verá que pueden escribirte o llamarte esta noche.</Text>
        <View style={st.row}>
          <Chip label="1 hora" on={false} onPress={() => run(() => repo.setAwake(60))} color={colors.blue} />
          <Chip label="2 horas" on={false} onPress={() => run(() => repo.setAwake(120))} color={colors.blue} />
          {awake && <Chip label="Ya no" on={false} onPress={() => run(() => repo.setAwake(0))} />}
        </View>
        {awake && <Text style={[T.small, { color: colors.blue }]}>Despierto hasta las {hhmm(presence.awake_until!)}</Text>}
      </Card>

      {incoming.length > 0 && <Label>Quieren añadirte</Label>}
      {incoming.map((p) => (
        <Card key={p.link_id} tint={colors.blueSoft} style={{ gap: 8 }}>
          <View style={st.row}><Initial name={p.name} size={40} /><View style={{ flex: 1 }}><Text style={T.strong}>{p.name}</Text><Text style={T.small}>{p.neighbour ? 'Vecino verificado' : 'De otro barrio'}</Text></View></View>
          <Text style={T.small}>Si aceptas, podréis avisaros al volver a casa o si alguien necesita ayuda. Luego eliges qué compartes.</Text>
          <View style={st.row}>
            <Button small label="Aceptar" tone="blue" onPress={() => run(() => repo.answerInvite(p.link_id, true))} style={{ flex: 1 }} />
            <Button small label="No, gracias" tone="ghost" onPress={() => run(() => repo.answerInvite(p.link_id, false))} />
          </View>
        </Card>
      ))}

      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <Label>{`Mi gente · ${accepted.length} de 30`}</Label>
        <Button small label={adding ? 'Cerrar' : '+ Añadir'} tone="soft" onPress={() => setAdding((x) => !x)} />
      </View>
      {adding && <Anadir onDone={() => { setAdding(false); load(); }} />}
      {accepted.length === 0 && !loading && <Note>Añade a familia, amigos o vecinos en los que confías. Solo entra quien acepta, y tú decides qué compartes con cada uno.</Note>}
      {accepted.length > 0 && (
        <View style={st.group}>
          {accepted.map((p, i) => (
            <View key={p.link_id} style={i > 0 && st.sep}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === p.other_id }} onPress={() => setOpen(open === p.other_id ? null : p.other_id)} style={st.line}>
                <Initial name={p.name} size={42} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={T.strong}>{p.name}</Text>
                  <Text style={T.small}>{p.neighbour ? 'Vecino verificado' : 'Amigo de otro barrio'}</Text>
                  <View style={st.row}>
                    {p.awake && <Badge label="Despierto" color={colors.blue} soft={colors.blueSoft} />}
                    {isToday(p.last_ok_at) && <Badge label={`Bien hoy, ${hhmm(p.last_ok_at!)}`} color={colors.green} soft={colors.greenSoft} />}
                  </View>
                </View>
                <Text style={{ color: colors.faint, fontSize: 18 }}>{open === p.other_id ? '⌃' : '›'}</Text>
              </Pressable>
              {open === p.other_id && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                  <Text style={T.small}>Lo que compartes con {p.name}:</Text>
                  <Toggle label="Puede seguir mi vuelta a casa" on={p.i_share_vuelvo} onPress={() => run(() => repo.setPerm(p.other_id, !p.i_share_vuelvo, p.i_share_cuidado))} />
                  <Toggle label="Recibe mis avisos de ayuda y ve mi «Estoy bien»" on={p.i_share_cuidado} onPress={() => run(() => repo.setPerm(p.other_id, p.i_share_vuelvo, !p.i_share_cuidado))} />
                  <Text style={T.small}>{p.name} comparte contigo: {[p.they_share_vuelvo && 'su vuelta a casa', p.they_share_cuidado && 'sus avisos de ayuda'].filter(Boolean).join(' y ') || 'nada por ahora'}.</Text>
                  <Button small label="Quitar de mi gente" tone="ghost" onPress={() => Alert.alert('Quitar de mi gente', `${p.name} dejará de ver lo que compartes.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => run(() => repo.removePerson(p.other_id)) }])} />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {sent.length > 0 && <Note>{`Esperando a que acepten: ${sent.map((p) => p.name).join(', ')}.`}</Note>}
      <Note>Stoop no sustituye al 112. Los avisos llegan mientras tu gente tiene Stoop abierto; los avisos con el móvil bloqueado llegarán con la versión instalable.</Note>
    </ScrollView>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={onPress} style={st.toggleRow}>
      <Text style={[T.body, { flex: 1 }]}>{label}</Text>
      <View style={[st.sw, on && { backgroundColor: colors.green }]}><View style={[st.knob, on && { alignSelf: 'flex-end' }]} /></View>
    </Pressable>
  );
}

function Anadir({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { repo.myInviteCode().then(setCode).catch((e: any) => Alert.alert('No se ha podido', e.message)); }, []);
  const add = async () => {
    setBusy(true);
    try { await repo.inviteByCode(input); Alert.alert('Invitación enviada', 'Cuando acepte, aparecerá en tu gente.'); onDone(); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
    finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text style={T.h2}>Tu código</Text>
      <Text style={st.code} selectable>{code ?? '······'}</Text>
      {!!code && <Button small label="Enviar mi código" tone="soft" onPress={() => Share.share({ message: `Añádeme a tu gente en Stoop con este código: ${code}` })} />}
      <Text style={T.small}>Pásaselo a quien quieras en tu gente, aunque viva en otro barrio. O escribe el suyo:</Text>
      <TextInput value={input} onChangeText={(t) => setInput(t.toUpperCase())} placeholder="Código de 6 letras" autoCapitalize="characters" maxLength={6} accessibilityLabel="Código de la otra persona" style={st.input} />
      <Button label="Añadir" tone="blue" busy={busy} disabled={input.trim().length !== 6} onPress={add} />
    </Card>
  );
}

// ------------------------------------------------------------------
// Vuelvo a casa: la ubicación solo se comparte con la app abierta y se borra al llegar.
// ------------------------------------------------------------------
function VueltaCasa({ me, walk, people, onClose }: { me: Me; walk: Walk | null; people: Person[]; onClose: () => void }) {
  const [minutes, setMinutes] = useState(20);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<'off' | 'on' | 'denied'>('off');
  const sub = useRef<Location.LocationSubscription | null>(null);
  const last = useRef(0);
  const watchers = people.filter((p) => p.status === 'aceptada' && p.i_share_vuelvo);

  const stopGps = () => { sub.current?.remove(); sub.current = null; };
  const startGps = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setGps('denied'); return; }
      stopGps();
      sub.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 }, (loc) => {
        const t = loc.timestamp || nowMs();
        if (t - last.current < 3000) return;
        last.current = t;
        repo.updateWalk(loc.coords.latitude, loc.coords.longitude).catch(() => {});
      });
      setGps('on');
    } catch {
      setGps('denied');
    }
  }, []);

  useEffect(() => {
    if (walk) Promise.resolve().then(startGps);
    return () => stopGps();
  }, [walk, startGps]);

  const act = async (f: () => Promise<void>, close?: boolean) => {
    setBusy(true);
    try { await f(); if (close) { stopGps(); onClose(); } else onClose(); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
    finally { setBusy(false); }
  };

  if (!walk) {
    return (
      <ScrollView contentContainerStyle={st.wrap}>
        <View style={{ flexDirection: 'row' }}><Button small label="‹ Mi gente" tone="soft" onPress={onClose} /></View>
        <Text style={T.title}>Vuelvo a casa</Text>
        <Text style={T.body}>Tu gente sabrá que vuelves y a qué hora deberías llegar. Mientras tengas Stoop abierto, verán también dónde estás.</Text>
        <Label>¿Cuánto tardas?</Label>
        <View style={st.row}>{[10, 15, 20, 30, 45].map((m) => <Chip key={m} label={`${m} min`} on={minutes === m} onPress={() => setMinutes(m)} color={colors.blue} />)}</View>
        <Label>Lo verán</Label>
        {watchers.length === 0
          ? <Note>Nadie de tu gente tiene activado «Puede seguir mi vuelta a casa». Actívalo en Mi gente, tocando a cada persona.</Note>
          : <View style={st.row}>{watchers.map((p) => <Badge key={p.other_id} label={p.name} color={colors.blue} soft={colors.blueSoft} />)}</View>}
        <Button label="Empezar" tone="blue" busy={busy} disabled={watchers.length === 0} onPress={() => act(() => repo.startWalk(minutes))} />
        <Btn112 />
        <Note>Solo guardamos tu última posición mientras dura la vuelta y la borramos al llegar. No hay historial de dónde has estado.</Note>
      </ScrollView>
    );
  }

  const late = new Date(walk.eta_at).getTime() < nowMs();
  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <Text style={T.kicker}>VUELVES A CASA, {me.name.toUpperCase()}</Text>
      <Text style={T.title}>Llegas sobre las {hhmm(walk.eta_at)}</Text>
      <Text style={[T.body, late && { color: '#8A5A12', fontWeight: '600' }]}>{late ? 'Ya es la hora. Si vas bien, avisa o pide más tiempo.' : `${watchers.length} ${watchers.length === 1 ? 'persona te acompaña' : 'personas te acompañan'}: ${watchers.map((p) => p.name).join(', ')}.`}</Text>
      {walk.lat != null && walk.lng != null && <WalkMap points={[{ id: walk.id, lat: walk.lat, lng: walk.lng, name: me.name, color: colors.blue }]} height={200} />}
      <Card tint={gps === 'on' ? colors.greenSoft : colors.goldSoft}>
        <Text style={T.small}>{gps === 'on' ? 'Compartiendo tu posición mientras Stoop esté abierto.' : gps === 'denied' ? 'Sin permiso de ubicación: tu gente solo sabe a qué hora deberías llegar.' : 'Pidiendo la ubicación…'}</Text>
      </Card>
      <Button label="He llegado bien" busy={busy} onPress={() => act(() => repo.endWalk(true), true)} style={{ minHeight: 64 }} />
      <Button label="Necesito 10 minutos más" tone="soft" onPress={() => act(() => repo.extendWalk(10))} />
      <Btn112 big />
      <Button small label="Dejar de compartir" tone="ghost" onPress={() => act(() => repo.endWalk(false), true)} />
      <Note>Si cierras Stoop, tu gente verá tu última posición y la hora a la que deberías llegar.</Note>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  big: { flex: 1, minHeight: 84, borderRadius: 16, borderWidth: 2, padding: 12, justifyContent: 'center', gap: 2, backgroundColor: colors.card },
  bigT: { fontSize: 19, fontWeight: '700' },
  b112: { minHeight: 48, borderRadius: 14, borderWidth: 2, borderColor: colors.red, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  b112Text: { color: colors.red, fontSize: 16, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  sw: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#D5D9DE', padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  code: { fontSize: 34, fontWeight: '700', letterSpacing: 6, color: colors.ink, textAlign: 'center' },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.field, paddingHorizontal: 12, fontSize: 18, letterSpacing: 3, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
});
