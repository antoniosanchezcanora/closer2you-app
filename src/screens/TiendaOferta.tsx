import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Chip, T } from '../components/ui';
import { repo } from '../lib/repo';
import { MAX_OFERTAS_ACTIVAS, MAX_OFERTAS_DIA } from '../lib/types';
import { colors, eur } from '../theme';

// Plantillas para que la oferta salga en diez segundos. El tendero puede cambiar el texto.
const TEMPLATES = [
  { title: 'Manzanas reineta', unit: 'el kilo', price: 240 },
  { title: 'Caja sorpresa de fruta', unit: 'unos 3 kg', price: 700 },
  { title: 'Plátanos para bizcocho', unit: 'el kilo', price: 190 },
];
const DISCOUNTS = [20, 30, 50];

function untilIso(kind: '14' | 'cierre') {
  const d = new Date();
  if (kind === '14') d.setHours(14, 0, 0, 0);
  else d.setHours(20, 30, 0, 0);
  if (d.getTime() < Date.now()) d.setTime(Date.now() + 2 * 3600 * 1000);
  return d.toISOString();
}

export default function TiendaOferta({ onDone }: { onDone: () => void }) {
  const [tpl, setTpl] = useState(0);
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [unit, setUnit] = useState(TEMPLATES[0].unit);
  const [price, setPrice] = useState(String(TEMPLATES[0].price / 100).replace('.', ','));
  const [pct, setPct] = useState(30);
  const [qty, setQty] = useState(8);
  const [until, setUntil] = useState<'14' | 'cierre'>('cierre');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  // Comprueba los límites antes de que el tendero rellene nada.
  useEffect(() => {
    (async () => {
      try {
        const list = await repo.shopOffersToday();
        const madrid = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
        const today = madrid(new Date().toISOString());
        const hoy = list.filter((o) => o.created_at && madrid(o.created_at) === today).length;
        const activas = list.filter((o) => o.active !== false && o.qty_left > 0 && new Date(o.until).getTime() > Date.now()).length;
        if (hoy >= MAX_OFERTAS_DIA) setBlocked('Hoy ya has publicado 2 ofertas. Mañana podrás publicar de nuevo.');
        else if (activas >= MAX_OFERTAS_ACTIVAS) setBlocked('Ya tienes 2 ofertas en la calle. Retira una en "Mi tienda" o espera a que se agote.');
        else setBlocked(null);
      } catch {
        setBlocked(null);
      }
    })();
  }, [published]);

  const oldCents = Math.round(parseFloat(price.replace(',', '.')) * 100) || 0;
  const newCents = Math.round((oldCents * (100 - pct)) / 100);

  const pick = (i: number) => {
    setTpl(i);
    setTitle(TEMPLATES[i].title);
    setUnit(TEMPLATES[i].unit);
    setPrice(String(TEMPLATES[i].price / 100).replace('.', ','));
    setPublished(false);
  };

  const publish = async () => {
    if (title.trim().length < 2 || oldCents <= 0) {
      Alert.alert('Falta algo', 'Pon qué ofreces y su precio normal.');
      return;
    }
    setBusy(true);
    try {
      await repo.publishOffer({ title: title.trim(), unit: unit.trim() || 'unidad', price_cents: newCents, old_price_cents: oldCents, qty_left: qty, until: untilIso(until) });
      setPublished(true);
    } catch (e: any) {
      Alert.alert('No se ha podido publicar', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <View>
        <Text style={T.h1}>Oferta rápida</Text>
        <Text style={T.small}>Diez segundos y tu ventana se enciende en la calle.</Text>
      </View>

      {blocked && !published && <Text style={st.blocked}>{blocked}</Text>}

      <Text style={T.h2}>1. Qué quieres sacar hoy</Text>
      <View style={st.wrapRow}>
        {TEMPLATES.map((t, i) => <Chip key={t.title} label={t.title} on={tpl === i} onPress={() => pick(i)} />)}
      </View>
      <TextInput value={title} onChangeText={(v) => { setTitle(v); setPublished(false); }} accessibilityLabel="Producto" style={st.input} maxLength={60} />
      <View style={st.row}>
        <TextInput value={price} onChangeText={(v) => { setPrice(v); setPublished(false); }} keyboardType="decimal-pad" accessibilityLabel="Precio normal en euros" style={[st.input, { flex: 1 }]} />
        <TextInput value={unit} onChangeText={(v) => { setUnit(v); setPublished(false); }} accessibilityLabel="Unidad" style={[st.input, { flex: 1 }]} />
      </View>

      <Text style={T.h2}>2. Cuánto lo bajas</Text>
      <View style={st.row}>
        {DISCOUNTS.map((d) => <Chip key={d} label={`-${d}%`} on={pct === d} onPress={() => { setPct(d); setPublished(false); }} />)}
      </View>
      <View style={st.row}>
        <Text style={[T.small, { textDecorationLine: 'line-through' }]}>{eur(oldCents)}</Text>
        <Text style={st.price}>{eur(newCents)}</Text>
        <Text style={T.small}>{unit}</Text>
      </View>

      <Text style={T.h2}>3. Cuántas y hasta cuándo</Text>
      <View style={st.row}>
        <Button label="-" tone="white" onPress={() => { setQty(Math.max(1, qty - 1)); setPublished(false); }} />
        <Text style={st.qty} accessibilityLiveRegion="polite">{qty}</Text>
        <Button label="+" tone="white" onPress={() => { setQty(Math.min(50, qty + 1)); setPublished(false); }} />
        <View style={{ flex: 1 }} />
        <Chip label="Las 14:00" on={until === '14'} onPress={() => { setUntil('14'); setPublished(false); }} />
        <Chip label="El cierre" on={until === 'cierre'} onPress={() => { setUntil('cierre'); setPublished(false); }} />
      </View>

      <Text style={T.h2}>Así lo ven tus vecinos</Text>
      <View style={st.preview}>
        <View style={[st.window, published && st.windowOn]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.previewKicker}>{until === '14' ? 'Hasta las 14:00' : 'Hasta el cierre'}</Text>
          <Text style={st.previewTitle}>{title || 'Tu oferta'} a {eur(newCents)}</Text>
          <Text style={st.previewSub}>Quedan {qty} · Reservar y recoger en tienda</Text>
        </View>
      </View>

      {published ? (
        <>
          <Text style={st.ok}>Publicada. Tu ventana ya brilla en la calle. Las reservas te llegan a Hoy.</Text>
          <Button label="Ver reservas" tone="mint" onPress={onDone} />
        </>
      ) : (
        <Button label="Publicar oferta" busy={busy} disabled={!!blocked} onPress={publish} />
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, fontWeight: '600', color: colors.ink },
  price: { fontSize: 26, fontWeight: '800', color: colors.ink },
  qty: { minWidth: 32, textAlign: 'center', fontSize: 20, fontWeight: '800', color: colors.ink },
  preview: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.night, borderRadius: 18, padding: 12 },
  window: { width: 46, height: 58, borderRadius: 6, borderWidth: 3, borderColor: colors.ink, backgroundColor: '#3A3160' },
  windowOn: { backgroundColor: colors.yellow, shadowColor: colors.yellow, shadowOpacity: 0.9, shadowRadius: 12, elevation: 8 },
  previewKicker: { fontSize: 12, fontWeight: '700', color: colors.yellow },
  previewTitle: { fontSize: 15, fontWeight: '800', color: '#FFF6E5' },
  previewSub: { fontSize: 13, color: '#CFC6EA' },
  blocked: { backgroundColor: colors.cream, borderRadius: 18, borderWidth: 2, borderColor: colors.ink, padding: 12, fontSize: 15, fontWeight: '700', color: colors.ink },
  ok: { backgroundColor: colors.mintSoft, borderRadius: 18, borderWidth: 2, borderColor: colors.ink, padding: 12, fontSize: 15, fontWeight: '700', color: colors.ink },
});
