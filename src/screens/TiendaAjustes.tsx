import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Chip, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Shop } from '../lib/types';
import { colors } from '../theme';

const FRANJAS = ['10:00 a 12:00', '12:00 a 14:00', '14:00 a 15:30', '17:00 a 19:00', '19:00 a 21:00'];
const RADIOS = [300, 500, 1000, 2000];
const toCents = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100) || 0;
const toText = (c: number | null) => (c ? String(c / 100).replace('.', ',') : '');

// La tienda decide si reparte, hasta dónde, a qué hora y cuánto cuesta. También su presentación.
export default function TiendaAjustes({ onDone }: { onDone: () => void }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [hours, setHours] = useState('');
  const [about, setAbout] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [fee, setFee] = useState('');
  const [free, setFree] = useState('');
  const [radius, setRadius] = useState(500);
  const [slots, setSlots] = useState<string[]>([]);
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    repo.myShop().then((s) => {
      if (!s) return;
      setShop(s); setHours(s.hours ?? ''); setAbout(s.about ?? ''); setEnabled(s.delivery_enabled);
      setFee(toText(s.delivery_fee_cents)); setFree(toText(s.delivery_free_from_cents)); setRadius(s.delivery_radius_m);
      setSlots(s.delivery_slots ?? []); setBy(s.delivery_by ?? '');
    }).catch((e) => Alert.alert('Error', e.message));
  }, []);

  const save = async () => {
    if (enabled && slots.length === 0) { Alert.alert('Falta algo', 'Elige al menos una franja de entrega.'); return; }
    setBusy(true);
    try {
      await repo.updateShop({
        hours: hours.trim() || null, about: about.trim() || null, delivery_enabled: enabled,
        delivery_fee_cents: toCents(fee), delivery_free_from_cents: toCents(free) || null, delivery_radius_m: radius,
        delivery_slots: slots, delivery_by: by.trim() || null,
      });
      Alert.alert('Guardado', 'Los vecinos ya ven los cambios en tu ficha.');
      onDone();
    } catch (e: any) {
      Alert.alert('No se ha podido guardar', e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleSlot = (f: string) => setSlots(slots.includes(f) ? slots.filter((x) => x !== f) : [...slots, f]);

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button small label="‹ Volver" tone="soft" onPress={onDone} />
      </View>
      <View>
        <Text style={T.kicker}>{shop?.name?.toUpperCase() ?? 'TU TIENDA'}</Text>
        <Text style={T.title}>Tu ficha y entregas</Text>
      </View>

      <Label>Horario</Label>
      <TextInput value={hours} onChangeText={setHours} placeholder="Abierta hasta las 21:00" accessibilityLabel="Horario" style={st.input} maxLength={60} />
      <Label>Quién está detrás</Label>
      <TextInput value={about} onChangeText={setAbout} placeholder="Cuéntales a tus vecinos quién eres y qué vendes" accessibilityLabel="Presentación" style={[st.input, { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]} multiline maxLength={280} />

      <Label>Entrega a domicilio</Label>
      <View style={st.card}>
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={T.strong}>Hago entregas</Text>
            <Text style={T.small}>Las llevas tú o alguien de la tienda. La recogida en tienda está siempre activa.</Text>
          </View>
          <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: colors.green, false: '#D5D9DE' }} accessibilityLabel="Hago entregas" />
        </View>
      </View>

      {enabled && (
        <>
          <Label>Precio</Label>
          <View style={st.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={T.small}>Coste de entrega (€)</Text>
              <TextInput value={fee} onChangeText={setFee} placeholder="0 = gratis" keyboardType="decimal-pad" accessibilityLabel="Coste de entrega en euros" style={st.input} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={T.small}>Gratis a partir de (€)</Text>
              <TextInput value={free} onChangeText={setFree} placeholder="Opcional" keyboardType="decimal-pad" accessibilityLabel="Gratis a partir de euros" style={st.input} />
            </View>
          </View>
          <Label>Hasta dónde</Label>
          <View style={st.wrapRow}>{RADIOS.map((r) => <Chip key={r} label={r < 1000 ? `${r} m` : `${r / 1000} km`} on={radius === r} onPress={() => setRadius(r)} color={colors.blue} />)}</View>
          <Label>Franjas</Label>
          <View style={st.wrapRow}>{FRANJAS.map((f) => <Chip key={f} label={f} on={slots.includes(f)} onPress={() => toggleSlot(f)} color={colors.green} />)}</View>
          <Label>Quién lo lleva</Label>
          <TextInput value={by} onChangeText={setBy} placeholder="Por ejemplo: Juan, mi hijo" accessibilityLabel="Quién lo lleva" style={st.input} maxLength={40} />
          <Note>El vecino te paga a ti. Su dirección solo la ves tú para ese pedido y se borra al entregarlo.</Note>
        </>
      )}

      <Button label="Guardar" busy={busy} onPress={save} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14 },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
});
