import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Chip, Initial, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Appointment, NewPro, Pro, ProKind, Review } from '../lib/types';
import { colors } from '../theme';

const KINDS: { id: ProKind; label: string }[] = [
  { id: 'fisio', label: 'Fisioterapia' }, { id: 'clases', label: 'Clases' }, { id: 'cuidados', label: 'Cuidados' }, { id: 'reparaciones', label: 'Reparaciones' }, { id: 'otro', label: 'Otro' },
];
const kindLabel = (k: ProKind) => KINDS.find((x) => x.id === k)?.label ?? 'Otro';
const STATUS: Record<Appointment['status'], { label: string; color: string; soft: string }> = {
  pendiente: { label: 'Pendiente', color: colors.gold, soft: colors.goldSoft },
  aceptada: { label: 'Aceptada', color: colors.green, soft: colors.greenSoft },
  rechazada: { label: 'No puede', color: colors.muted, soft: '#EEEFF1' },
  hecha: { label: 'Hecha', color: colors.blue, soft: colors.blueSoft },
  cancelada: { label: 'Cancelada', color: colors.muted, soft: '#EEEFF1' },
};
const stars = (n: number) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));

function Requisitos({ p }: { p: Pro }) {
  return (
    <View style={st.row}>
      <Badge label="Visto en persona por Stoop" color={colors.green} soft={colors.greenSoft} />
      <Badge label="Autónomo dado de alta" color={colors.green} soft={colors.greenSoft} />
      {!!p.colegiado && <Badge label="Colegiado" color={colors.green} soft={colors.greenSoft} />}
      {p.seguro_rc && <Badge label="Seguro de responsabilidad civil" color={colors.green} soft={colors.greenSoft} />}
      {p.cert_menores && <Badge label="Certificado para trabajar con menores" color={colors.green} soft={colors.greenSoft} />}
    </View>
  );
}

// Tiendas > Profesionales (Fase 2)
export default function Profesionales() {
  const [pros, setPros] = useState<Pro[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Pro | null>(null);
  const [filtro, setFiltro] = useState<ProKind | 'todos'>('todos');

  const load = useCallback(async () => {
    try { const [p, a] = await Promise.all([repo.pros(), repo.myAppointments()]); setPros(p); setAppts(a); }
    catch (e: any) { Alert.alert('No se ha podido cargar', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  if (open) return <ProDetalle pro={open} onBack={() => { setOpen(null); load(); }} />;
  const shown = pros.filter((p) => filtro === 'todos' || p.kind === filtro);
  const active = appts.filter((a) => a.status === 'pendiente' || a.status === 'aceptada' || (a.status === 'hecha' && !a.reviewed));

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {active.length > 0 && <Label>Mis citas</Label>}
      {active.map((a) => <CitaCliente key={a.id} a={a} onChange={load} />)}
      <View style={st.row}>
        <Chip label="Todos" on={filtro === 'todos'} onPress={() => setFiltro('todos')} color={colors.green} />
        {KINDS.filter((k) => pros.some((p) => p.kind === k.id)).map((k) => <Chip key={k.id} label={k.label} on={filtro === k.id} onPress={() => setFiltro(k.id)} color={colors.green} />)}
      </View>
      {shown.length === 0 && !loading && <Note>Todavía no hay profesionales verificados en tu barrio. Los vamos visitando uno a uno.</Note>}
      {shown.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => setOpen(p)}>
          <Card style={{ gap: 8 }}>
            <View style={st.line}>
              <Initial name={p.title} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.h2}>{p.title}</Text>
                <Text style={T.small}>{kindLabel(p.kind)}{p.price_text ? ` · ${p.price_text}` : ''}</Text>
                <Text style={[T.small, { color: colors.gold }]}>{p.reviews ? `${stars(p.avg_stars ?? 0)} ${String(p.avg_stars).replace('.', ',')} · ${p.reviews} ${p.reviews === 1 ? 'reseña' : 'reseñas'}` : 'Sin reseñas todavía'}</Text>
              </View>
              <Text style={{ color: colors.faint, fontSize: 18 }}>›</Text>
            </View>
            <Requisitos p={p} />
          </Card>
        </Pressable>
      ))}
      <Note>Solo aparecen autónomos que hemos visitado en persona, con sus papeles al día. Stoop no cobra nada: la cita se paga en persona.</Note>
    </ScrollView>
  );
}

function CitaCliente({ a, onChange }: { a: Appointment; onChange: () => void }) {
  const [n, setN] = useState(5);
  const [text, setText] = useState('');
  const run = async (f: () => Promise<void>) => { try { await f(); onChange(); } catch (e: any) { Alert.alert('No se ha podido', e.message); } };
  const s = STATUS[a.status];
  return (
    <Card style={{ gap: 8 }}>
      <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={T.strong}>{a.pro_title}</Text><Badge label={s.label} color={s.color} soft={s.soft} /></View>
      <Text style={T.small}>{a.when_text}{a.note ? ` · ${a.note}` : ''}</Text>
      {(a.status === 'pendiente' || a.status === 'aceptada') && <Button small label="Cancelar la cita" tone="ghost" onPress={() => run(() => repo.setAppointment(a.id, 'cancelada'))} />}
      {a.status === 'hecha' && !a.reviewed && (
        <View style={{ gap: 8 }}>
          <Text style={T.small}>¿Qué tal? Solo opinan quienes tuvieron cita.</Text>
          <View style={st.row}>{[1, 2, 3, 4, 5].map((k) => <Pressable key={k} accessibilityRole="button" accessibilityLabel={`${k} estrellas`} onPress={() => setN(k)}><Text style={{ fontSize: 30, color: k <= n ? colors.gold : '#D5D9DE' }}>★</Text></Pressable>)}</View>
          <TextInput value={text} onChangeText={setText} placeholder="Cuéntalo en una frase (opcional)" maxLength={400} style={st.input} accessibilityLabel="Reseña" />
          <Button small label="Publicar reseña" onPress={() => run(() => repo.review(a, n, text))} />
        </View>
      )}
    </Card>
  );
}

function ProDetalle({ pro, onBack }: { pro: Pro; onBack: () => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { repo.proReviews(pro.id).then(setReviews).catch(() => {}); }, [pro.id]);
  const pedir = async () => {
    setBusy(true);
    try { await repo.requestAppointment(pro.id, when, note); Alert.alert('Cita pedida', `${pro.title} te responderá en la app. El pago se hace en persona.`); onBack(); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
    finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <View style={{ flexDirection: 'row' }}><Button small label="‹ Profesionales" tone="soft" onPress={onBack} /></View>
      <View style={st.line}>
        <Initial name={pro.title} size={64} />
        <View style={{ flex: 1, gap: 2 }}><Text style={T.h1}>{pro.title}</Text><Text style={T.small}>{kindLabel(pro.kind)}{pro.price_text ? ` · ${pro.price_text}` : ''}</Text></View>
      </View>
      {!!pro.about && <Text style={T.body}>{pro.about}</Text>}
      <Requisitos p={pro} />
      <Card style={{ gap: 8 }}>
        <Text style={T.h2}>Pedir cita</Text>
        <View style={st.row}>{['Esta semana', 'Por la mañana', 'Por la tarde', 'El sábado'].map((w) => <Chip key={w} label={w} on={when === w} onPress={() => setWhen(w)} color={colors.green} />)}</View>
        <TextInput value={when} onChangeText={setWhen} placeholder="Cuándo te viene bien" maxLength={60} style={st.input} accessibilityLabel="Cuándo" />
        <TextInput value={note} onChangeText={setNote} placeholder="Qué necesitas (opcional)" maxLength={300} style={[st.input, { minHeight: 70 }]} multiline accessibilityLabel="Qué necesitas" />
        <Button label="Pedir cita" busy={busy} disabled={when.trim().length < 2} onPress={pedir} />
        <Text style={T.small}>Stoop no cobra nada. Acordáis el precio y lo pagas en persona.</Text>
      </Card>
      <Label>{`Reseñas · ${reviews.length}`}</Label>
      {reviews.length === 0 && <Note>Todavía no tiene reseñas. Solo pueden opinar quienes tuvieron cita a través de Stoop.</Note>}
      {reviews.map((r) => (
        <Card key={r.id} style={{ gap: 4 }}>
          <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={T.strong}>{r.author_name}</Text><Text style={{ color: colors.gold }}>{stars(r.stars)}</Text></View>
          {!!r.body && <Text style={T.body}>{r.body}</Text>}
          <Text style={T.small}>Cita hecha a través de Stoop</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

// ------------------------------------------------------------------
// Perfil > Ofrecer un servicio profesional
// ------------------------------------------------------------------
export function MiServicio({ onBack }: { onBack: () => void }) {
  const [pro, setPro] = useState<Pro | null | undefined>(undefined);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const load = useCallback(async () => {
    try { const p = await repo.myPro(); setPro(p); setAppts(p ? await repo.proAppointments() : []); }
    catch (e: any) { Alert.alert('No se ha podido cargar', e.message); setPro(null); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);
  const run = async (f: () => Promise<void>) => { try { await f(); load(); } catch (e: any) { Alert.alert('No se ha podido', e.message); } };

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={pro === undefined} onRefresh={load} />}>
      <View style={{ flexDirection: 'row' }}><Button small label="‹ Perfil" tone="soft" onPress={onBack} /></View>
      <Text style={T.title}>Tu servicio</Text>
      {pro === null && <Solicitud onDone={load} />}
      {pro && (
        <>
          <Card style={{ gap: 8 }}>
            <View style={[st.row, { justifyContent: 'space-between' }]}>
              <Text style={T.h2}>{pro.title}</Text>
              <Badge label={pro.status === 'verificada' ? 'Verificado' : pro.status === 'pausada' ? 'En pausa' : pro.status === 'rechazada' ? 'No aprobado' : 'Pendiente de visita'}
                color={pro.status === 'verificada' ? colors.green : pro.status === 'rechazada' ? colors.red : colors.gold} soft={pro.status === 'verificada' ? colors.greenSoft : pro.status === 'rechazada' ? colors.redSoft : colors.goldSoft} />
            </View>
            {pro.status === 'solicitada' && <Text style={T.small}>Te escribimos para quedar en persona. Ten a mano tu DNI, el alta de autónomo (RETA){pro.kind === 'fisio' ? ', tu número de colegiado y el seguro de responsabilidad civil' : ''}{pro.with_minors ? ' y el certificado negativo del Registro Central de Delincuentes Sexuales' : ''}.</Text>}
            {pro.status === 'verificada' && <Button small label="Pausar mi servicio" tone="ghost" onPress={() => run(() => repo.updatePro({ status: 'pausada' }))} />}
            {pro.status === 'pausada' && <Button small label="Volver a aparecer" onPress={() => run(() => repo.updatePro({ status: 'verificada' }))} />}
            <Text style={T.small}>Si cambias lo que declaraste, tu ficha vuelve a revisión antes de aparecer.</Text>
          </Card>
          <Label>Citas</Label>
          {appts.length === 0 && <Note>Aún no te han pedido cita.</Note>}
          {appts.map((a) => {
            const s = STATUS[a.status];
            return (
              <Card key={a.id} style={{ gap: 8 }}>
                <View style={[st.row, { justifyContent: 'space-between' }]}><Text style={T.strong}>{a.client_name}</Text><Badge label={s.label} color={s.color} soft={s.soft} /></View>
                <Text style={T.small}>{a.when_text}{a.note ? ` · ${a.note}` : ''}</Text>
                {a.status === 'pendiente' && (
                  <View style={st.row}>
                    <Button small label="Aceptar" onPress={() => run(() => repo.setAppointment(a.id, 'aceptada'))} style={{ flex: 1 }} />
                    <Button small label="No puedo" tone="ghost" onPress={() => run(() => repo.setAppointment(a.id, 'rechazada'))} />
                  </View>
                )}
                {a.status === 'aceptada' && (
                  <View style={st.row}>
                    <Button small label="Ya está hecha" tone="blue" onPress={() => run(() => repo.setAppointment(a.id, 'hecha'))} style={{ flex: 1 }} />
                    <Button small label="Cancelar" tone="ghost" onPress={() => run(() => repo.setAppointment(a.id, 'cancelada'))} />
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function Check({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={st.check}>
      <View style={[st.box, on && { backgroundColor: colors.green, borderColor: colors.green }]}>{on && <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}</View>
      <View style={{ flex: 1 }}><Text style={T.body}>{label}</Text>{!!sub && <Text style={T.small}>{sub}</Text>}</View>
    </Pressable>
  );
}

function Solicitud({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState<NewPro>({ kind: 'fisio', title: '', about: '', price_text: '', colegiado: '', seguro_rc: false, reta: false, with_minors: false, cert_menores: false });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<NewPro>) => setF((x) => ({ ...x, ...p }));
  const health = f.kind === 'fisio';
  const missing = [
    f.title.trim().length < 3 && 'cómo te llamamos en la ficha',
    !f.reta && 'el alta de autónomo',
    health && !f.colegiado?.trim() && 'tu número de colegiado',
    health && !f.seguro_rc && 'el seguro de responsabilidad civil',
    f.with_minors && !f.cert_menores && 'el certificado para trabajar con menores',
  ].filter(Boolean) as string[];
  const send = async () => {
    setBusy(true);
    try {
      await repo.applyPro({ ...f, title: f.title.trim(), about: f.about?.trim() || null, price_text: f.price_text?.trim() || null, colegiado: health ? f.colegiado?.trim() || null : null });
      Alert.alert('Solicitud enviada', 'Te escribimos para quedar en persona y ver tus papeles. Hasta entonces no apareces.');
      onDone();
    } catch (e: any) { Alert.alert('No se ha podido', e.message); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={T.body}>Solo autónomos del barrio. Antes de aparecer, alguien de Stoop te visita y comprueba tus papeles. No cobramos comisión: el cliente te paga en persona.</Text>
      <Label>Qué haces</Label>
      <View style={st.row}>{KINDS.map((k) => <Chip key={k.id} label={k.label} on={f.kind === k.id} onPress={() => set({ kind: k.id })} color={colors.green} />)}</View>
      <TextInput value={f.title} onChangeText={(t) => set({ title: t })} placeholder="Ej.: Irene, fisioterapeuta" maxLength={60} style={st.input} accessibilityLabel="Nombre en la ficha" />
      <TextInput value={f.about ?? ''} onChangeText={(t) => set({ about: t })} placeholder="Qué ofreces, en dos frases" maxLength={400} multiline style={[st.input, { minHeight: 80 }]} accessibilityLabel="Descripción" />
      <TextInput value={f.price_text ?? ''} onChangeText={(t) => set({ price_text: t })} placeholder="Precio orientativo (ej.: 40 € la sesión)" maxLength={60} style={st.input} accessibilityLabel="Precio" />
      <Label>Papeles</Label>
      <Check label="Estoy dado de alta como autónomo (RETA)" on={f.reta} onPress={() => set({ reta: !f.reta })} />
      {health && (
        <>
          <TextInput value={f.colegiado ?? ''} onChangeText={(t) => set({ colegiado: t })} placeholder="Número de colegiado" maxLength={40} style={st.input} accessibilityLabel="Número de colegiado" />
          <Check label="Tengo seguro de responsabilidad civil" sub="Obligatorio para profesiones sanitarias (Ley 44/2003, art. 46)" on={f.seguro_rc} onPress={() => set({ seguro_rc: !f.seguro_rc })} />
        </>
      )}
      <Check label="Trabajo con niños o adolescentes" on={f.with_minors} onPress={() => set({ with_minors: !f.with_minors, cert_menores: false })} />
      {f.with_minors && <Check label="Tengo el certificado negativo de delitos sexuales" sub="Obligatorio para trabajar con menores (LO 8/2021, art. 57)" on={f.cert_menores} onPress={() => set({ cert_menores: !f.cert_menores })} />}
      {missing.length > 0 && <Note tint={colors.goldSoft} color="#8A5A12">{`Falta: ${missing.join(', ')}.`}</Note>}
      <Button label="Enviar solicitud" busy={busy} disabled={missing.length > 0} onPress={send} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, backgroundColor: colors.card, borderRadius: 12, padding: 12 },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: '#B8BDC4', alignItems: 'center', justifyContent: 'center' },
});
