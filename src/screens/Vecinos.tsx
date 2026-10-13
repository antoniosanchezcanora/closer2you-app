import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Badge, Button, Card, Chip, Initial, Label, Note, Segment, T } from '../components/ui';
import { repo } from '../lib/repo';
import { supabase } from '../lib/supabase';
import type { ChatMessage, Conversation, Level, Me, NeighbourRequest, NewRequest, ReportReason, RequestCategory, RequestKind } from '../lib/types';
import { colors, hhmm } from '../theme';
import MiGente from './MiGente';

const CATS: { id: RequestCategory; label: string }[] = [
  { id: 'compra', label: 'Compra' }, { id: 'recado', label: 'Recado' }, { id: 'prestamo', label: 'Préstamo' }, { id: 'compania', label: 'Compañía' }, { id: 'otro', label: 'Otro' },
];
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return m < 2880 ? 'ayer' : `hace ${Math.round(m / 1440)} días`;
};

// Pestaña Vecinos. Fase 2: solo cuentas de prueba hasta que pase la revisión de seguridad.
export default function Vecinos({ me, openConv, onConvShown }: { me: Me | null; openConv?: Conversation | null; onConvShown?: () => void }) {
  const [seg, setSeg] = useState<'tablon' | 'mensajes' | 'mio' | 'gente'>(openConv ? 'gente' : 'tablon');
  const [chat, setChat] = useState<Conversation | null>(openConv ?? null);
  useEffect(() => { if (openConv) { Promise.resolve().then(() => { setChat(openConv); onConvShown?.(); }); } }, [openConv, onConvShown]);

  if (!me?.fase2 || !me.verified) {
    return (
      <ScrollView contentContainerStyle={st.wrap}>
        <Text style={T.title}>Vecinos</Text>
        <Card style={{ gap: 8 }}>
          <Text style={T.h2}>Llega en la Fase 2</Text>
          <Text style={[T.body, { color: '#3D434A' }]}>Pedir y ofrecer favores, tu gente de confianza y cuidaros entre vosotros. Lo abrimos cuando el barrio tenga sus tiendas y tras una revisión de seguridad.</Text>
        </Card>
        <Note>Mientras tanto, la agenda del barrio está en Mi calle.</Note>
      </ScrollView>
    );
  }
  if (chat) return <Chat me={me} conv={chat} onBack={() => setChat(null)} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 6, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={T.title}>Vecinos</Text>
          <Badge label="Fase 2 · prueba" color={colors.blue} soft={colors.blueSoft} />
        </View>
        <Segment items={[{ id: 'tablon', label: 'Tablón' }, { id: 'mensajes', label: 'Mensajes' }, { id: 'gente', label: 'Mi gente' }, { id: 'mio', label: 'Lo mío' }]} value={seg} onChange={setSeg} />
      </View>
      {seg === 'tablon' && <Tablon me={me} onOpenChat={setChat} />}
      {seg === 'mensajes' && <Mensajes onOpen={setChat} />}
      {seg === 'gente' && <MiGente me={me} onOpenChat={setChat} />}
      {seg === 'mio' && <LoMio me={me} />}
    </View>
  );
}

// ------------------------------------------------------------------
function Tablon({ me, onOpenChat }: { me: Me; onOpenChat: (c: Conversation) => void }) {
  const [list, setList] = useState<NeighbourRequest[]>([]);
  const [kind, setKind] = useState<RequestKind>('pido');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  const load = useCallback(async () => {
    try { setList(await repo.requests()); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const help = async (r: NeighbourRequest) => {
    setBusyId(r.id);
    try {
      await repo.offerHelp(r.id, r.kind === 'pido' ? 'Puedo ayudarte.' : 'Me interesa.');
      setSent((x) => [...x, r.id]);
      Alert.alert('Enviado', `${r.author_name} lo verá. Si acepta, podréis escribiros en Mensajes.`);
    } catch (e: any) {
      Alert.alert('No se ha podido', e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (creating) return <NuevaPeticion onDone={() => { setCreating(false); load(); }} />;
  const shown = list.filter((r) => r.kind === kind && r.status === 'abierta' && r.author_id !== me.id);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Piden" on={kind === 'pido'} onPress={() => setKind('pido')} color={colors.blue} />
          <Chip label="Ofrecen" on={kind === 'ofrezco'} onPress={() => setKind('ofrezco')} color={colors.blue} />
        </View>
        {shown.length === 0 && !loading && <Note>{kind === 'pido' ? 'Nadie pide nada ahora mismo. Buena señal.' : 'Nadie ofrece nada ahora mismo. ¿Empiezas tú?'}</Note>}
        {shown.map((r) => (
          <Card key={r.id} style={{ gap: 8 }}>
            <View style={st.row}>
              <Initial name={r.author_name} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={T.strong}>{r.author_name}</Text>
                <Text style={T.small}>Vecino verificado · {ago(r.created_at)}{r.when_text ? ' · ' + r.when_text : ''}</Text>
              </View>
            </View>
            <Text style={[T.body, { fontSize: 17 }]}>{r.title}</Text>
            {!!r.details && <Text style={T.small}>{r.details}</Text>}
            <View style={st.row}>
              {sent.includes(r.id)
                ? <Text style={[T.small, { color: colors.blue }]}>Enviado. Si {r.author_name} acepta, podréis escribiros en Mensajes.</Text>
                : <Button small label={r.kind === 'pido' ? 'Puedo ayudar' : 'Me interesa'} tone="blue" busy={busyId === r.id} onPress={() => help(r)} />}
            </View>
          </Card>
        ))}
        <Note>Los favores no se cobran. Nunca compartas tu dirección hasta que hayáis hablado por el chat.</Note>
        <View style={{ height: 70 }} />
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={st.fab}><Text style={st.fabText}>+ Pedir u ofrecer</Text></Pressable>
    </View>
  );
}

function NuevaPeticion({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<RequestKind>('pido');
  const [category, setCategory] = useState<RequestCategory>('compra');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [when, setWhen] = useState('Hoy');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (title.trim().length < 3) { Alert.alert('Falta algo', kind === 'pido' ? 'Cuenta qué necesitas.' : 'Cuenta qué ofreces.'); return; }
    setBusy(true);
    try { await repo.createRequest({ kind, category, title: title.trim(), details: details.trim() || null, when_text: when } as NewRequest); onDone(); }
    catch (e: any) { Alert.alert('No se ha podido publicar', e.message); }
    finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={T.h1}>{kind === 'pido' ? 'Pedir ayuda' : 'Ofrecer algo'}</Text>
        <Button small label="Cancelar" tone="soft" onPress={onDone} />
      </View>
      <Segment items={[{ id: 'pido', label: 'Pido ayuda' }, { id: 'ofrezco', label: 'Ofrezco algo' }]} value={kind} onChange={setKind} />
      <TextInput value={title} onChangeText={setTitle} placeholder={kind === 'pido' ? 'Qué necesitas: que me suban la compra...' : 'Qué ofreces: presto una escalera...'} accessibilityLabel="Qué" style={st.input} maxLength={140} />
      <TextInput value={details} onChangeText={setDetails} placeholder="Más detalles (opcional)" accessibilityLabel="Detalles" style={[st.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]} multiline maxLength={300} />
      <Label>Tipo</Label>
      <View style={st.wrapRow}>{CATS.map((c) => <Chip key={c.id} label={c.label} on={category === c.id} onPress={() => setCategory(c.id)} color={colors.blue} />)}</View>
      <Label>Cuándo</Label>
      <View style={st.wrapRow}>{['Hoy', 'Mañana', 'Esta semana', 'Cuando sea'].map((w) => <Chip key={w} label={w} on={when === w} onPress={() => setWhen(w)} color={colors.blue} />)}</View>
      <Note>Lo ven los vecinos verificados de tu calle. Tu dirección nunca se muestra: solo la compartes tú, por chat, con quien te ayude.</Note>
      <Button label="Publicar" tone="blue" busy={busy} onPress={save} />
    </ScrollView>
  );
}

// ------------------------------------------------------------------
function Mensajes({ onOpen }: { onOpen: (c: Conversation) => void }) {
  const [list, setList] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setList(await repo.conversations()); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const answer = async (c: Conversation, accept: boolean) => {
    try { await repo.answerConversation(c.id, accept); await load(); if (accept) onOpen({ ...c, status: 'aceptada' }); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
  };

  const pendientes = list.filter((c) => c.status === 'pendiente' && !c.i_started);
  const resto = list.filter((c) => !(c.status === 'pendiente' && !c.i_started) && c.status !== 'rechazada');
  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {pendientes.length > 0 && <Label>Quieren ayudarte</Label>}
      {pendientes.map((c) => (
        <Card key={c.id} tint={colors.blueSoft} style={{ gap: 8 }}>
          <View style={st.row}><Initial name={c.other_name} size={40} /><View style={{ flex: 1 }}><Text style={T.strong}>{c.other_name}</Text><Text style={T.small}>{c.request_title ?? 'Tu gente'}</Text></View></View>
          {!!c.last_text && <Text style={T.body}>«{c.last_text}»</Text>}
          <View style={st.row}>
            <Button small label="Aceptar y hablar" tone="blue" onPress={() => answer(c, true)} style={{ flex: 1 }} />
            <Button small label="No, gracias" tone="ghost" onPress={() => answer(c, false)} />
          </View>
        </Card>
      ))}
      {resto.length > 0 && <Label>Conversaciones</Label>}
      {resto.length > 0 && (
        <View style={st.group}>
          {resto.map((c, i) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => onOpen(c)} style={({ pressed }) => [st.line, i > 0 && st.sep, pressed && { opacity: 0.7 }]}>
              <Initial name={c.other_name} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={T.strong}>{c.other_name}</Text>
                <Text style={T.small} numberOfLines={1}>{c.status === 'pendiente' ? 'Esperando a que acepte' : c.status === 'bloqueada' ? 'Bloqueada' : c.last_text ?? c.request_title ?? 'Tu gente'}</Text>
              </View>
              <Text style={T.small}>{hhmm(c.last_at)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {list.length === 0 && !loading && <Note>Aquí aparecen las conversaciones. Solo podéis escribiros cuando el otro acepta.</Note>}
    </ScrollView>
  );
}

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'acoso', label: 'Acoso o insultos' }, { id: 'estafa', label: 'Intento de estafa' }, { id: 'cobro', label: 'Quiere cobrar un favor' }, { id: 'inapropiado', label: 'Contenido inapropiado' }, { id: 'otro', label: 'Otra cosa' },
];

function Chat({ me, conv, onBack }: { me: Me; conv: Conversation; onBack: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [reporting, setReporting] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const load = useCallback(async () => {
    try { setMsgs(await repo.messages(conv.id)); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); }
  }, [conv.id]);
  useEffect(() => {
    Promise.resolve().then(load);
    if (!supabase) return;
    const ch = supabase.channel('chat-' + conv.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` }, () => load()).subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [conv.id, load]);

  const send = async () => {
    const body = text.trim(); if (!body) return;
    setText('');
    try { await repo.sendMessage(conv.id, body); await load(); } catch (e: any) { setText(body); Alert.alert('No se ha enviado', e.message); }
  };
  const menu = () => Alert.alert(conv.other_name, undefined, [
    { text: 'Añadir a mi gente', onPress: async () => { try { await repo.invitePerson(conv.other_id); Alert.alert('Invitación enviada', `Cuando ${conv.other_name} acepte, aparecerá en Mi gente.`); } catch (e: any) { Alert.alert('No se ha podido', e.message); } } },
    { text: 'Denunciar', onPress: () => setReporting(true) },
    { text: 'Bloquear', style: 'destructive', onPress: () => Alert.alert('Bloquear', `${conv.other_name} no podrá escribirte ni ver lo que publicas.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Bloquear', style: 'destructive', onPress: async () => { await repo.blockUser(conv.other_id); onBack(); } }]) },
    { text: 'Cerrar', style: 'cancel' },
  ]);
  const report = async (reason: ReportReason) => {
    try { await repo.report(conv.other_id, reason, '', conv.id); setReporting(false); Alert.alert('Gracias', 'El equipo de Stoop lo revisa. Si te sientes en peligro, llama al 112.'); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
  };

  const open = conv.status === 'aceptada';
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={60}>
      <View style={st.chatHead}>
        <Button small label="‹" tone="soft" onPress={onBack} />
        <Initial name={conv.other_name} size={36} />
        <View style={{ flex: 1 }}><Text style={T.strong}>{conv.other_name}</Text><Text style={T.small} numberOfLines={1}>{conv.request_title ?? 'Tu gente'}</Text></View>
        <Button small label="···" tone="soft" onPress={menu} />
      </View>
      {reporting ? (
        <ScrollView contentContainerStyle={st.wrap}>
          <Text style={T.h2}>¿Qué ha pasado?</Text>
          {REASONS.map((r) => <Button key={r.id} label={r.label} tone="ghost" onPress={() => report(r.id)} />)}
          <Button label="Cancelar" tone="soft" onPress={() => setReporting(false)} />
        </ScrollView>
      ) : (
        <>
          <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 8 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
            <Text style={st.sys}>{open ? 'Podéis escribiros porque los dos habéis aceptado. Si algo no te cuadra, en el botón ··· puedes bloquear o denunciar.' : conv.status === 'pendiente' ? 'Esperando a que acepte. Hasta entonces no podéis escribiros.' : 'Esta conversación está cerrada.'}</Text>
            {msgs.map((m) => {
              const mine = m.sender_id === me.id;
              return (
                <View key={m.id} style={[st.bubble, mine ? st.mine : st.theirs]}>
                  <Text style={{ fontSize: 16, color: mine ? '#FFFFFF' : colors.ink }}>{m.body}</Text>
                  <Text style={{ fontSize: 11, color: mine ? '#DCE6F7' : colors.faint, alignSelf: 'flex-end' }}>{hhmm(m.created_at)}</Text>
                </View>
              );
            })}
          </ScrollView>
          {open && (
            <View style={st.composer}>
              <TextInput value={text} onChangeText={setText} placeholder="Escribe un mensaje" accessibilityLabel="Mensaje" style={st.composerInput} maxLength={500} multiline />
              <Button small label="Enviar" tone="blue" disabled={!text.trim()} onPress={send} />
            </View>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

// ------------------------------------------------------------------
function LoMio({ me }: { me: Me }) {
  const [level, setLevel] = useState<Level | null>(null);
  const [mine, setMine] = useState<NeighbourRequest[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [closing, setClosing] = useState<NeighbourRequest | null>(null);
  const [hours, setHours] = useState(1);
  const load = useCallback(async () => {
    try {
      const [l, r, c] = await Promise.all([repo.myLevel(), repo.requests(), repo.conversations()]);
      setLevel(l); setMine(r.filter((x) => x.author_id === me.id)); setConvs(c);
    } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); }
  }, [me.id]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const close = async (helperId: string | null) => {
    if (!closing) return;
    try { await repo.closeRequest(closing.id, helperId, hours); setClosing(null); load(); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
  };

  const pct = level ? Math.min(1, (level.favors_given % 3) / 3) : 0;
  const helpers = closing ? convs.filter((c) => c.request_id === closing.id && c.status === 'aceptada') : [];
  return (
    <ScrollView contentContainerStyle={st.wrap}>
      {level && (
        <Card style={{ gap: 10 }}>
          <View style={st.row}>
            <Svg width={84} height={84} viewBox="0 0 80 80">
              <Circle cx={40} cy={40} r={32} fill="none" stroke="#EEEFF1" strokeWidth={8} />
              <Circle cx={40} cy={40} r={32} fill="none" stroke={colors.green} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${201 * pct} 201`} transform="rotate(-90 40 40)" />
              <SvgText x={40} y={47} textAnchor="middle" fontSize={20} fontWeight="700" fill={colors.ink}>{level.level}</SvgText>
            </Svg>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.small}>Tu nivel</Text>
              <Text style={T.h2}>{level.level >= 3 ? 'Vecino de confianza' : level.level === 2 ? 'Buen vecino' : 'Vecino'}</Text>
              <Text style={[T.small, { color: colors.green }]}>{level.next_at - level.favors_given} {level.next_at - level.favors_given === 1 ? 'ayuda más' : 'ayudas más'} para el nivel {level.level + 1}</Text>
            </View>
          </View>
          <Label>Banco de tiempo</Label>
          <View style={st.row}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 26, fontWeight: '700', color: colors.green }}>{level.hours_given} h</Text><Text style={T.small}>has dado</Text></View>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 26, fontWeight: '700', color: colors.blue }}>{level.hours_received} h</Text><Text style={T.small}>has recibido</Text></View>
          </View>
        </Card>
      )}
      <Label>Tus peticiones</Label>
      {mine.length === 0 && <Note>Todavía no has pedido ni ofrecido nada.</Note>}
      {mine.map((r) => (
        <Card key={r.id} style={{ gap: 6 }}>
          <View style={st.row}><Badge label={r.kind === 'pido' ? 'Pides' : 'Ofreces'} color={colors.blue} soft={colors.blueSoft} /><Badge label={r.status === 'abierta' ? 'Abierta' : r.status === 'resuelta' ? 'Resuelta' : 'Cerrada'} color={r.status === 'abierta' ? colors.green : colors.muted} soft={r.status === 'abierta' ? colors.greenSoft : '#EEEFF1'} /></View>
          <Text style={T.body}>{r.title}</Text>
          {r.status === 'abierta' && <Button small label="Ya está resuelto" tone="soft" onPress={() => { setClosing(r); setHours(1); }} />}
          {closing?.id === r.id && (
            <View style={{ gap: 8 }}>
              <Text style={T.small}>¿Quién te ayudó? Suma el tiempo a su banco de tiempo. Nunca se paga.</Text>
              {helpers.length === 0 && <Text style={T.small}>Nadie te ha escrito por esta petición todavía.</Text>}
              <View style={st.row}>{[0.5, 1, 2, 3].map((h) => <Chip key={h} label={`${String(h).replace('.', ',')} h`} on={hours === h} onPress={() => setHours(h)} color={colors.green} />)}</View>
              {helpers.map((c) => <Button key={c.id} small label={`Me ayudó ${c.other_name}`} onPress={() => close(c.other_id)} />)}
              <Button small label="Cerrar sin ayuda" tone="ghost" onPress={() => close(null)} />
            </View>
          )}
        </Card>
      ))}
      <Note>El nivel sube ayudando, nunca pagando.</Note>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  fab: { position: 'absolute', right: 16, bottom: 16, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.ink, boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.2)' },
  fabText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
  sys: { alignSelf: 'center', textAlign: 'center', fontSize: 13, color: colors.muted, backgroundColor: '#E9EAED', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 24 },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.blue, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, backgroundColor: colors.bg, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: colors.ink },
});
