import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Initial, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Me, Offer, Reservation, ReservationStatus } from '../lib/types';
import { colors, eur, hhmm } from '../theme';

const STATUS: Record<ReservationStatus, { text: string; color: string; soft: string }> = {
  nueva: { text: 'Esperando a la tienda', color: colors.gold, soft: colors.goldSoft },
  lista: { text: 'Lista para recoger', color: colors.green, soft: colors.greenSoft },
  recogida: { text: 'Recogida', color: colors.muted, soft: '#EEEFF1' },
  rechazada: { text: 'No le quedaba', color: colors.muted, soft: '#EEEFF1' },
  cancelada: { text: 'Cancelada', color: colors.muted, soft: '#EEEFF1' },
  no_show: { text: 'No pasaste', color: colors.muted, soft: '#EEEFF1' },
};

function offerBadge(o: Offer) {
  if (o.kind === 'lote') return { label: 'Lote', color: colors.gold, soft: colors.goldSoft };
  if (o.kind === 'novedad') return { label: 'Novedad', color: colors.green, soft: colors.greenSoft };
  if (o.old_price_cents) return { label: `-${Math.round(100 - (o.price_cents * 100) / o.old_price_cents)}%`, color: colors.red };
  return { label: 'Oferta', color: colors.red };
}

export default function VecinoHoy({ me, onVerified }: { me: Me | null; onVerified: () => void }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [mine, setMine] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([repo.liveOffers(), repo.myReservations()]);
      setOffers(o);
      setMine(m);
    } catch (e: any) {
      Alert.alert('No se ha podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga al abrir; la llamada va en una microtarea para no encadenar renders.
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const refresh = () => { load(); onVerified(); };

  const reserve = async (o: Offer) => {
    setBusyId(o.id);
    try {
      await repo.reserve(o.id, 1);
      await load();
      Alert.alert('Reservado', `${o.shop_name ?? 'La tienda'} te lo guarda hasta las ${hhmm(o.until)}. Pagas en la tienda al recogerlo.`);
    } catch (e: any) {
      Alert.alert('No se ha podido reservar', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const mute = (shopId: string, name?: string) => {
    Alert.alert('Silenciar tienda', `No verás más ofertas de ${name ?? 'esta tienda'} en tu calle.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Silenciar', style: 'destructive', onPress: async () => { try { await repo.muteShop(shopId); await load(); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  };

  // Agrupa por tienda: quien publica más no ocupa más sitio en la calle.
  const groups = Object.values(
    offers.reduce<Record<string, { shopId: string; shopName?: string; offers: Offer[] }>>((acc, o) => {
      (acc[o.shop_id] ??= { shopId: o.shop_id, shopName: o.shop_name, offers: [] }).offers.push(o);
      return acc;
    }, {}),
  );

  const askCode = async () => {
    try { setCode(await repo.requestShopCode()); } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const verified = !!me?.verified;
  const activas = mine.filter((r) => r.status === 'nueva' || r.status === 'lista');
  const pasadas = mine.filter((r) => r.status !== 'nueva' && r.status !== 'lista').slice(0, 5);

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
      <View style={st.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={T.kicker}>TU CALLE AHORA</Text>
          <Text style={T.title}>General Lacy</Text>
          {verified && me?.verifiedBy ? <Badge label={`Verificado por ${me.verifiedBy}`} color={colors.green} soft={colors.greenSoft} /> : null}
        </View>
        {me ? <Initial name={me.name} size={44} /> : null}
      </View>

      {!verified && (
        <Card tint={colors.greenSoft} style={{ gap: 10 }}>
          <Text style={[T.h2, { color: '#1F4A37' }]}>Confirma que eres del barrio</Text>
          <Text style={[T.body, { color: '#1F4A37', fontSize: 15 }]}>Pide tu código y enséñalo en cualquier tienda de Stoop. Cuando te confirmen, verás las ofertas de tu calle.</Text>
          {code ? (
            <View style={st.codeBox}>
              <Text style={st.code} accessibilityLabel={`Tu código es ${code.split('').join(' ')}`}>{code}</Text>
              <Text style={T.small}>Válido 7 días. Tu dirección no se muestra a nadie.</Text>
            </View>
          ) : (
            <Button label="Pedir mi código" onPress={askCode} />
          )}
        </Card>
      )}

      {activas.length > 0 && (
        <>
          <Label>Tus reservas</Label>
          <View style={st.group}>
            {activas.map((r, i) => (
              <View key={r.id} style={[st.resRow, i > 0 && st.sep]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={T.strong}>{r.qty > 1 ? `${r.qty} × ` : ''}{r.offer_title}</Text>
                  <Text style={T.small}>{r.shop_name}</Text>
                  <Badge label={STATUS[r.status].text} color={STATUS[r.status].color} soft={STATUS[r.status].soft} />
                </View>
                <Button small label="Cancelar" tone="ghost" onPress={async () => { try { await repo.cancel(r.id); load(); } catch (e: any) { Alert.alert('Error', e.message); } }} />
              </View>
            ))}
          </View>
        </>
      )}

      {verified && <Label>Ofertas de hoy</Label>}
      {verified && offers.length === 0 && !loading && (
        <Note>Ahora mismo no hay ofertas. Vuelve por la tarde, que es cuando más salen.</Note>
      )}
      {/* Una tarjeta por tienda, ordenadas por la oferta más reciente. Nunca por precio ni descuento. */}
      {groups.map((g) => (
        <Card key={g.shopId} style={{ gap: 0, paddingVertical: 6 }}>
          <View style={st.shopHead}>
            <Initial name={g.shopName ?? 'T'} size={36} square />
            <Text style={[T.strong, { flex: 1 }]}>{g.shopName}</Text>
            <Button small label="Silenciar" tone="soft" onPress={() => mute(g.shopId, g.shopName)} />
          </View>
          {g.offers.map((o) => {
            const b = offerBadge(o);
            return (
              <View key={o.id} style={[st.offer, st.sep]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Badge label={b.label} color={b.color} soft={b.soft} />
                  <Text style={T.strong}>{o.title}</Text>
                  <View style={st.priceRow}>
                    <Text style={st.price}>{eur(o.price_cents)}</Text>
                    {o.kind === 'rebaja' && !!o.old_price_cents && <Text style={[T.small, { textDecorationLine: 'line-through' }]}>{eur(o.old_price_cents)}</Text>}
                    <Text style={T.small}>{o.unit}</Text>
                  </View>
                  <Text style={T.small}>Quedan {o.qty_left} · hasta las {hhmm(o.until)}</Text>
                </View>
                <Button small label="Reservar" busy={busyId === o.id} onPress={() => reserve(o)} />
              </View>
            );
          })}
        </Card>
      ))}

      {verified && <Note>Reservas aquí y pagas en la tienda al recogerlo. Nunca pagas en la app.</Note>}

      {pasadas.length > 0 && (
        <>
          <Label>Antes</Label>
          <View style={st.group}>
            {pasadas.map((r, i) => (
              <View key={r.id} style={[st.resRow, i > 0 && st.sep]}>
                <View style={{ flex: 1 }}>
                  <Text style={[T.body, { fontSize: 15 }]}>{r.offer_title}</Text>
                  <Text style={T.small}>{r.shop_name} · {STATUS[r.status].text}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 4 },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  shopHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 19, fontWeight: '700', color: colors.ink },
  codeBox: { backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 4, alignItems: 'center' },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 2, color: colors.ink },
});
