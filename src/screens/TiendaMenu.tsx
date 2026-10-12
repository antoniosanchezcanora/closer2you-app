import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Chip, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import { ALERGENOS } from '../lib/types';
import type { Menu, Shop } from '../lib/types';
import { colors, eur, hhmm } from '../theme';

const HASTA = ['15:30', '16:00', '16:30'];
const toCents = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100) || 0;
const untilIso = (hhmmStr: string) => {
  const [h, m] = hhmmStr.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now()) d.setTime(Date.now() + 2 * 3600 * 1000);
  return d.toISOString();
};

// El restaurante publica su menú del día en segundos. No cuenta como oferta.
export default function TiendaMenu({ shop, onDone }: { shop: Shop; onDone: () => void }) {
  const [menu, setMenu] = useState<Menu | null | undefined>(undefined);
  const [starters, setStarters] = useState('');
  const [mains, setMains] = useState('');
  const [includes, setIncludes] = useState('Postre o café, pan y bebida');
  const [price, setPrice] = useState('10');
  const [qty, setQty] = useState(20);
  const [hasta, setHasta] = useState('16:00');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [none, setNone] = useState(false);
  const [takeaway, setTakeaway] = useState(true);
  const [delivery, setDelivery] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setMenu(await repo.myMenuToday()); } catch (e: any) { Alert.alert('Error', e.message); setMenu(null); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const toggle = (a: string) => { setNone(false); setAllergens(allergens.includes(a) ? allergens.filter((x) => x !== a) : [...allergens, a]); };

  const publish = async () => {
    if (starters.trim().length < 2 || mains.trim().length < 2 || toCents(price) <= 0) { Alert.alert('Falta algo', 'Pon los primeros, los segundos y el precio.'); return; }
    // Real Decreto 126/2015: la información de alérgenos es obligatoria antes de la compra.
    if (allergens.length === 0 && !none) { Alert.alert('Alérgenos', 'Marca los alérgenos del menú, o confirma que no lleva ninguno de los 14 de declaración obligatoria.'); return; }
    setBusy(true);
    try {
      await repo.publishMenu({ starters: starters.trim(), mains: mains.trim(), includes: includes.trim() || null, price_cents: toCents(price), qty_total: qty, until: untilIso(hasta), allergens, takeaway, delivery: delivery && shop.delivery_enabled });
      await load();
    } catch (e: any) {
      Alert.alert('No se ha podido publicar', e.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!menu) return;
    Alert.alert('Cerrar el menú', 'Dejará de verse en la calle. Las reservas ya hechas se mantienen.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar', style: 'destructive', onPress: async () => { try { await repo.closeMenu(menu.id); await load(); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  };

  if (menu === undefined) return <View style={{ flex: 1 }} />;

  if (menu) {
    const vendidos = menu.qty_total - menu.qty_left;
    return (
      <ScrollView contentContainerStyle={st.wrap}>
        <View>
          <Text style={T.kicker}>{shop.name.toUpperCase()}</Text>
          <Text style={T.title}>Menú de hoy</Text>
        </View>
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ fontSize: 34, fontWeight: '700', color: colors.wine }}>{menu.qty_left}</Text>
            <Text style={T.small}>quedan de {menu.qty_total} · {menu.active ? `se cierra solo al llegar a 0 o a las ${hhmm(menu.until)}` : 'cerrado'}</Text>
          </View>
          <View style={st.bar}><View style={[st.fill, { width: `${(vendidos / menu.qty_total) * 100}%` }]} /></View>
          <Text style={T.body}><Text style={T.strong}>Primero: </Text>{menu.starters}</Text>
          <Text style={T.body}><Text style={T.strong}>Segundo: </Text>{menu.mains}</Text>
          <Text style={T.small}>{eur(menu.price_cents)}{menu.includes ? ' · ' + menu.includes : ''}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{menu.allergens.map((a) => <Badge key={a} label={a} color="#8A5A12" soft={colors.goldSoft} />)}</View>
        </Card>
        {menu.active && <Button label="Cerrar el menú de hoy" tone="ghost" onPress={close} />}
        <Button label="Ver reservas" tone="wine" onPress={onDone} />
        <Note>Mañana podrás publicar el siguiente. El menú no cuenta como oferta: además puedes publicar 2 ofertas al día.</Note>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={T.kicker}>{shop.name.toUpperCase()}</Text>
        <Text style={T.title}>Menú del día</Text>
      </View>
      <Label>Primeros</Label>
      <TextInput value={starters} onChangeText={setStarters} placeholder="Lentejas estofadas o ensalada mixta" accessibilityLabel="Primeros" style={st.input} maxLength={200} />
      <Label>Segundos</Label>
      <TextInput value={mains} onChangeText={setMains} placeholder="Merluza a la plancha o pollo asado" accessibilityLabel="Segundos" style={st.input} maxLength={200} />
      <Label>Incluye</Label>
      <TextInput value={includes} onChangeText={setIncludes} accessibilityLabel="Qué incluye" style={st.input} maxLength={120} />
      <View style={st.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Precio (€)</Text>
          <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" accessibilityLabel="Precio en euros" style={st.input} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Menús hoy</Text>
          <View style={st.row}>
            <Button small label="−" tone="soft" onPress={() => setQty(Math.max(1, qty - 1))} />
            <Text style={st.qty}>{qty}</Text>
            <Button small label="+" tone="soft" onPress={() => setQty(Math.min(200, qty + 1))} />
          </View>
        </View>
      </View>
      <Label>Hasta</Label>
      <View style={st.wrapRow}>{HASTA.map((h) => <Chip key={h} label={h} on={hasta === h} onPress={() => setHasta(h)} color={colors.wine} />)}</View>

      <Label>Alérgenos (obligatorio)</Label>
      <View style={st.wrapRow}>
        {ALERGENOS.map((a) => <Chip key={a} label={a} on={allergens.includes(a)} onPress={() => toggle(a)} color="#8A5A12" />)}
        <Chip label="No lleva ninguno" on={none} onPress={() => { setNone(!none); setAllergens([]); }} color={colors.green} />
      </View>

      <View style={st.card}>
        <View style={st.row}>
          <Text style={[T.body, { flex: 1 }]}>Para llevar</Text>
          <Switch value={takeaway} onValueChange={setTakeaway} trackColor={{ true: colors.wine, false: '#D5D9DE' }} accessibilityLabel="Para llevar" />
        </View>
        <View style={[st.row, { marginTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={T.body}>Lo llevamos a casa</Text>
            {!shop.delivery_enabled && <Text style={T.small}>Activa antes las entregas en tu ficha.</Text>}
          </View>
          <Switch value={delivery && shop.delivery_enabled} disabled={!shop.delivery_enabled} onValueChange={setDelivery} trackColor={{ true: colors.wine, false: '#D5D9DE' }} accessibilityLabel="Lo llevamos a casa" />
        </View>
      </View>

      <Button label="Publicar menú" tone="wine" busy={busy} onPress={publish} />
      <Note>Cada reserva descuenta un menú y se cierra solo al llegar a 0. No cuenta como oferta.</Note>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14 },
  qty: { minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.ink },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#EEEFF1', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.wine },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
});
