import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Chip, Label, Note, Segment, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { ShopRequest, ShopRequestStatus } from '../lib/types';
import { colors } from '../theme';

const CATS: { id: ShopRequest['category']; label: string }[] = [
  { id: 'fruteria', label: 'Frutería' }, { id: 'panaderia', label: 'Panadería' }, { id: 'carniceria', label: 'Carnicería' },
  { id: 'pescaderia', label: 'Pescadería' }, { id: 'peluqueria', label: 'Peluquería' }, { id: 'otra', label: 'Otra' },
];
// NIF de persona (DNI o NIE con letra) o de sociedad (letra + 7 cifras + control). Solo forma, no lo validamos contra Hacienda.
const NIF_RE = /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;

// Perfil > Tengo un negocio en el barrio
export default function AltaTienda({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'codigo' | 'pedir'>('codigo');
  const [req, setReq] = useState<ShopRequestStatus | null>(null);
  useEffect(() => { repo.myShopRequest().then(setReq).catch(() => {}); }, []);

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row' }}><Button small label="‹ Perfil" tone="soft" onPress={onBack} /></View>
      <Text style={T.title}>Tu negocio en Stoop</Text>
      <Text style={T.body}>Solo comercio local e independiente: nada de cadenas ni franquicias. Por eso antes de aparecer pasamos a conocerte.</Text>
      {req ? (
        <Card style={{ gap: 6 }}>
          <View style={st.row}><Text style={[T.h2, { flex: 1 }]}>{req.name}</Text><Badge label={req.status === 'pendiente' ? 'Pendiente de visita' : req.status === 'aprobada' ? 'Aprobada' : 'No aprobada'} color={req.status === 'rechazada' ? colors.red : req.status === 'aprobada' ? colors.green : colors.gold} soft={req.status === 'rechazada' ? colors.redSoft : req.status === 'aprobada' ? colors.greenSoft : colors.goldSoft} /></View>
          <Text style={T.small}>{req.street}</Text>
          {req.status === 'pendiente' && <Text style={T.small}>Te escribimos para pasar por la tienda. Al terminar la visita te damos un código: lo metes aquí y la tienda es tuya.</Text>}
        </Card>
      ) : null}
      <Segment items={[{ id: 'codigo', label: 'Tengo un código' }, { id: 'pedir', label: 'Pedir el alta' }]} value={mode} onChange={setMode} />
      {mode === 'codigo' ? <Reclamar onDone={onDone} /> : <Pedir onSent={(r) => { setReq(r); setMode('codigo'); }} />}
    </ScrollView>
  );
}

function Reclamar({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const name = await repo.claimShop(code);
      Alert.alert('¡Bienvenido!', `${name} ya es tuya en Stoop. La encuentras en Perfil, Modo tienda.`);
      onDone();
    } catch (e: any) { Alert.alert('No se ha podido', e.message); }
    finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text style={T.h2}>Escribe el código de tu tarjeta</Text>
      <Text style={T.small}>Te lo dejamos al visitar la tienda. Son 8 letras y números.</Text>
      <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/\s/g, ''))} placeholder="Ej.: PACO2828" autoCapitalize="characters" maxLength={8} style={st.code} accessibilityLabel="Código de la tienda" />
      <Button label="Activar mi tienda" busy={busy} disabled={code.length !== 8} onPress={go} />
    </Card>
  );
}

function Pedir({ onSent }: { onSent: (r: ShopRequestStatus) => void }) {
  const [f, setF] = useState<ShopRequest>({ name: '', tipo: 'tienda', category: 'fruteria', street: '', nif: '', independent: false, phone: '' });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ShopRequest>) => setF((x) => ({ ...x, ...p }));
  const nifOk = NIF_RE.test(f.nif.trim().toUpperCase());
  const missing = [
    f.name.trim().length < 2 && 'el nombre',
    f.street.trim().length < 3 && 'la calle',
    !nifOk && 'un NIF válido',
    !f.independent && 'confirmar que es un negocio independiente',
  ].filter(Boolean) as string[];
  const send = async () => {
    setBusy(true);
    try {
      await repo.requestShop({ ...f, phone: f.phone?.trim() || null });
      const r = await repo.myShopRequest();
      Alert.alert('Solicitud enviada', 'Te escribimos para pasar por la tienda. Suele ser en pocos días.');
      if (r) onSent(r);
    } catch (e: any) { Alert.alert('No se ha podido', e.message); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 10 }}>
      <Segment items={[{ id: 'tienda', label: 'Tienda' }, { id: 'restaurante', label: 'Bar o restaurante' }]} value={f.tipo} onChange={(t) => set({ tipo: t, category: t === 'restaurante' ? 'otra' : f.category })} />
      <TextInput value={f.name} onChangeText={(t) => set({ name: t })} placeholder="Nombre del negocio" maxLength={60} style={st.input} accessibilityLabel="Nombre del negocio" />
      {f.tipo === 'tienda' && (
        <>
          <Label>Qué es</Label>
          <View style={st.row}>{CATS.map((c) => <Chip key={c.id} label={c.label} on={f.category === c.id} onPress={() => set({ category: c.id })} color={colors.green} />)}</View>
        </>
      )}
      <TextInput value={f.street} onChangeText={(t) => set({ street: t })} placeholder="Calle y número del local" maxLength={80} style={st.input} accessibilityLabel="Dirección del local" />
      <TextInput value={f.nif} onChangeText={(t) => set({ nif: t.toUpperCase() })} placeholder="NIF del negocio" autoCapitalize="characters" maxLength={12} style={st.input} accessibilityLabel="NIF" />
      <TextInput value={f.phone ?? ''} onChangeText={(t) => set({ phone: t })} placeholder="Teléfono para quedar (opcional)" keyboardType="phone-pad" maxLength={20} style={st.input} accessibilityLabel="Teléfono" />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.independent }} onPress={() => set({ independent: !f.independent })} style={st.check}>
        <View style={[st.box, f.independent && { backgroundColor: colors.green, borderColor: colors.green }]}>{f.independent && <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}</View>
        <Text style={[T.body, { flex: 1 }]}>Es un negocio independiente: no es una cadena ni una franquicia</Text>
      </Pressable>
      {missing.length > 0 && <Note tint={colors.goldSoft} color="#8A5A12">{`Falta: ${missing.join(', ')}.`}</Note>}
      <Button label="Pedir el alta" busy={busy} disabled={missing.length > 0} onPress={send} />
      <Note>Usamos el NIF y el teléfono solo para comprobar el negocio y quedar contigo. No se publican.</Note>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  code: { minHeight: 56, borderRadius: 12, backgroundColor: colors.field, paddingHorizontal: 12, fontSize: 24, letterSpacing: 4, textAlign: 'center', color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, backgroundColor: colors.card, borderRadius: 12, padding: 12 },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: '#B8BDC4', alignItems: 'center', justifyContent: 'center' },
});
