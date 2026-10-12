import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Chip, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import { MAX_OFERTAS_ACTIVAS, MAX_OFERTAS_DIA } from '../lib/types';
import type { OfferKind, PriorPriceBasis } from '../lib/types';
import { colors, eur } from '../theme';

// Tres tipos de oferta: así las tiendas compiten por lo que tienen, no solo por el precio.
const KINDS: { id: OfferKind; label: string; help: string }[] = [
  { id: 'rebaja', label: 'Rebaja', help: 'Un producto más barato hoy. Se ve el precio de antes y el de ahora.' },
  { id: 'lote', label: 'Lote', help: 'Una caja o lote a un precio cerrado. No se compara con nada.' },
  { id: 'novedad', label: 'Novedad', help: 'Lo que ha llegado hoy, con su precio de siempre.' },
];

// Plantillas por tipo para que salga en diez segundos. El tendero puede cambiar el texto.
const TEMPLATES: Record<OfferKind, { title: string; unit: string; price: number }[]> = {
  rebaja: [
    { title: 'Manzanas reineta', unit: 'el kilo', price: 240 },
    { title: 'Plátanos para bizcocho', unit: 'el kilo', price: 190 },
    { title: 'Tomates para salsa', unit: 'el kilo', price: 280 },
  ],
  lote: [
    { title: 'Caja sorpresa de fruta', unit: 'unos 3 kg', price: 350 },
    { title: 'Lote de verdura para caldo', unit: 'para 4 personas', price: 300 },
  ],
  novedad: [
    { title: 'Han llegado nísperos', unit: 'el kilo', price: 390 },
    { title: 'Primeras mandarinas', unit: 'el kilo', price: 260 },
  ],
};
const DISCOUNTS = [20, 30, 50];

function untilIso(kind: '14' | 'cierre') {
  const d = new Date();
  if (kind === '14') d.setHours(14, 0, 0, 0);
  else d.setHours(20, 30, 0, 0);
  if (d.getTime() < Date.now()) d.setTime(Date.now() + 2 * 3600 * 1000);
  return d.toISOString();
}

const toCents = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100) || 0;
const toText = (c: number) => String(c / 100).replace('.', ',');

export default function TiendaOferta({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<OfferKind>('rebaja');
  const [tpl, setTpl] = useState(0);
  const [title, setTitle] = useState(TEMPLATES.rebaja[0].title);
  const [unit, setUnit] = useState(TEMPLATES.rebaja[0].unit);
  const [price, setPrice] = useState(toText(TEMPLATES.rebaja[0].price));
  const [pct, setPct] = useState(30);
  const [basis, setBasis] = useState<PriorPriceBasis | null>(null);
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

  const touch = () => setPublished(false);
  const priceCents = toCents(price);
  const isRebaja = kind === 'rebaja';
  const finalCents = isRebaja ? Math.round((priceCents * (100 - pct)) / 100) : priceCents;

  const pickKind = (k: OfferKind) => {
    setKind(k);
    pick(k, 0);
  };
  const pick = (k: OfferKind, i: number) => {
    const t = TEMPLATES[k][i];
    setTpl(i);
    setTitle(t.title);
    setUnit(t.unit);
    setPrice(toText(t.price));
    setBasis(null);
    touch();
  };

  const publish = async () => {
    if (title.trim().length < 2 || priceCents <= 0) {
      Alert.alert('Falta algo', isRebaja ? 'Pon qué ofreces y su precio de antes.' : 'Pon qué ofreces y su precio.');
      return;
    }
    if (isRebaja && !basis) {
      Alert.alert('Un último paso', 'Confirma de dónde sale el precio de antes. La ley pide que sea el más bajo de los últimos 30 días, salvo productos a punto de caducar.');
      return;
    }
    setBusy(true);
    try {
      await repo.publishOffer({
        kind,
        prior_price_basis: isRebaja ? basis : null,
        title: title.trim(),
        unit: unit.trim() || 'unidad',
        price_cents: finalCents,
        old_price_cents: isRebaja ? priceCents : null,
        qty_left: qty,
        until: untilIso(until),
      });
      setPublished(true);
    } catch (e: any) {
      Alert.alert('No se ha podido publicar', e.message);
    } finally {
      setBusy(false);
    }
  };

  const kindInfo = KINDS.find((k) => k.id === kind)!;

  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <View>
        <Text style={T.kicker}>LISTA EN 10 SEGUNDOS</Text>
        <Text style={T.title}>Nueva oferta</Text>
      </View>

      {blocked && !published && <Note tint={colors.goldSoft} color={colors.ink}>{blocked}</Note>}

      <Label>Tipo de oferta</Label>
      <View style={st.row}>
        {KINDS.map((k) => <Chip key={k.id} label={k.label} on={kind === k.id} onPress={() => pickKind(k.id)} color={colors.green} />)}
      </View>
      <Text style={T.small}>{kindInfo.help}</Text>

      <Label>Qué sacas hoy</Label>
      <View style={st.wrapRow}>
        {TEMPLATES[kind].map((t, i) => <Chip key={t.title} label={t.title} on={tpl === i} onPress={() => pick(kind, i)} />)}
      </View>
      <TextInput value={title} onChangeText={(v) => { setTitle(v); touch(); }} accessibilityLabel="Producto" style={st.input} maxLength={60} />
      <View style={st.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>{isRebaja ? 'Precio de antes (€)' : 'Precio (€)'}</Text>
          <TextInput value={price} onChangeText={(v) => { setPrice(v); touch(); }} keyboardType="decimal-pad" accessibilityLabel={isRebaja ? 'Precio de antes en euros' : 'Precio en euros'} style={st.input} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>{kind === 'lote' ? 'Qué lleva' : 'Unidad'}</Text>
          <TextInput value={unit} onChangeText={(v) => { setUnit(v); touch(); }} accessibilityLabel={kind === 'lote' ? 'Contenido del lote' : 'Unidad'} style={st.input} />
        </View>
      </View>

      {isRebaja && (
        <>
          <Label>Cuánto lo bajas</Label>
          <View style={st.row}>
            {DISCOUNTS.map((d) => <Chip key={d} label={`-${d}%`} on={pct === d} onPress={() => { setPct(d); touch(); }} color={colors.red} />)}
          </View>
          <View style={st.legal}>
            <Text style={T.strong}>¿De dónde sale el precio de antes?</Text>
            <Radio on={basis === 'minimo_30_dias'} label="Es el más bajo que he tenido en los últimos 30 días" onPress={() => { setBasis('minimo_30_dias'); touch(); }} />
            <Radio on={basis === 'proximo_a_caducar'} label="El producto está a punto de caducar o de pasarse" onPress={() => { setBasis('proximo_a_caducar'); touch(); }} />
            <Text style={T.small}>La ley de rebajas no deja inflar el precio de antes. Si no estás seguro, publícalo como Novedad o como Lote.</Text>
          </View>
        </>
      )}

      <View style={st.row}>
        {isRebaja && <Text style={[T.small, { textDecorationLine: 'line-through' }]}>{eur(priceCents)}</Text>}
        <Text style={st.price}>{eur(finalCents)}</Text>
        <Text style={T.small}>{unit}</Text>
      </View>

      <Label>Cuántas y hasta cuándo</Label>
      <View style={st.row}>
        <Button small label="−" tone="soft" onPress={() => { setQty(Math.max(1, qty - 1)); touch(); }} />
        <Text style={st.qty} accessibilityLiveRegion="polite">{qty}</Text>
        <Button small label="+" tone="soft" onPress={() => { setQty(Math.min(50, qty + 1)); touch(); }} />
        <View style={{ flex: 1 }} />
        <Chip label="Las 14:00" on={until === '14'} onPress={() => { setUntil('14'); touch(); }} />
        <Chip label="El cierre" on={until === 'cierre'} onPress={() => { setUntil('cierre'); touch(); }} />
      </View>

      <Label>Así lo ven tus vecinos</Label>
      <Card>
        <Badge label={isRebaja ? `-${pct}%` : kindInfo.label} color={isRebaja ? colors.red : kind === 'lote' ? colors.gold : colors.green} soft={isRebaja ? undefined : kind === 'lote' ? colors.goldSoft : colors.greenSoft} />
        <Text style={T.strong}>{title || 'Tu oferta'}</Text>
        <View style={st.row}>
          <Text style={st.priceSm}>{eur(finalCents)}</Text>
          {isRebaja && <Text style={[T.small, { textDecorationLine: 'line-through' }]}>{eur(priceCents)}</Text>}
          <Text style={T.small}>{unit}</Text>
        </View>
        <Text style={T.small}>Quedan {qty} · {until === '14' ? 'hasta las 14:00' : 'hasta el cierre'}</Text>
      </Card>

      {published ? (
        <>
          <Note tint={colors.greenSoft} color="#1F4A37">Publicada. Los vecinos de tu calle ya la ven. Las reservas te llegan a Mi tienda al momento.</Note>
          <Button label="Ver reservas" onPress={onDone} />
        </>
      ) : (
        <Button label="Publicar oferta" busy={busy} disabled={!!blocked} onPress={publish} />
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function Radio({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={st.radio}>
      <View style={[st.dot, on && st.dotOn]} />
      <Text style={[T.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  price: { fontSize: 26, fontWeight: '700', color: colors.ink },
  priceSm: { fontSize: 19, fontWeight: '700', color: colors.ink },
  qty: { minWidth: 32, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.ink },
  legal: { backgroundColor: colors.blueSoft, borderRadius: 16, padding: 12, gap: 8 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B8BDC4', backgroundColor: colors.card },
  dotOn: { borderColor: colors.green, backgroundColor: colors.green },
});
