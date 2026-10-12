import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Offer, Reservation } from '../lib/types';
import { colors, eur, hhmm } from '../theme';

const STATUS_TEXT: Record<string, string> = {
  nueva: 'Esperando a la tienda', lista: 'Lista para recoger', recogida: 'Recogida', rechazada: 'No le quedaba', cancelada: 'Cancelada', no_show: 'No pasaste',
};

export default function VecinoHoy() {
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

  useEffect(() => { load(); }, [load]);

  const reserve = async (o: Offer) => {
    setBusyId(o.id);
    try {
      await repo.reserve(o.id, 1);
      await load();
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

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View>
        <Text style={T.h1}>Hoy en tu calle</Text>
        <Text style={T.small}>Ofertas de las tiendas de General Lacy y alrededores. Reservas aquí y pagas en la tienda.</Text>
      </View>

      {offers.length === 0 && !loading && <Text style={T.small}>Ahora mismo no hay ofertas. Vuelve por la tarde, que es cuando más salen.</Text>}
      {/* Una tarjeta por tienda, ordenadas por la oferta más reciente. Nunca por precio ni descuento. */}
      {groups.map((g) => (
        <Card key={g.shopId}>
          <View style={st.row}>
            <View style={st.window} />
            <Text style={[T.strong, { flex: 1 }]}>{g.shopName}</Text>
            <Button label="Silenciar" tone="ghost" onPress={() => mute(g.shopId, g.shopName)} />
          </View>
          {g.offers.map((o) => (
            <View key={o.id} style={st.offer}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.strong}>{o.title}</Text>
                <View style={st.row}>
                  <Text style={st.price}>{eur(o.price_cents)}</Text>
                  {!!o.old_price_cents && <Text style={[T.small, { textDecorationLine: 'line-through' }]}>{eur(o.old_price_cents)}</Text>}
                  <Text style={T.small}>{o.unit}</Text>
                </View>
                <Text style={T.small}>Quedan {o.qty_left} · hasta las {hhmm(o.until)}</Text>
              </View>
              <Button label="Resérvamelo" busy={busyId === o.id} onPress={() => reserve(o)} />
            </View>
          ))}
        </Card>
      ))}

      {mine.length > 0 && <Text style={[T.h2, { marginTop: 8 }]}>Tus reservas</Text>}
      {mine.map((r) => (
        <Card key={r.id}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={T.strong}>{r.offer_title}</Text>
              <Text style={T.small}>{r.shop_name} · {STATUS_TEXT[r.status]}</Text>
            </View>
            {['nueva', 'lista'].includes(r.status) && (
              <Button label="Cancelar" tone="ghost" onPress={async () => { await repo.cancel(r.id); load(); }} />
            )}
          </View>
        </Card>
      ))}

      <View style={st.verify}>
        <Text style={T.strong}>¿Aún no estás verificado?</Text>
        <Text style={T.small}>Pide tu código y enséñalo en cualquier tienda del barrio que esté en la app.</Text>
        {code ? <Text style={st.code}>{code}</Text> : <Button label="Pedir mi código" tone="white" onPress={askCode} />}
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  window: { width: 28, height: 34, borderRadius: 6, borderWidth: 3, borderColor: colors.ink, backgroundColor: colors.yellow },
  kicker: { fontSize: 12, fontWeight: '700', color: colors.muted },
  price: { fontSize: 18, fontWeight: '800', color: colors.ink },
  verify: { backgroundColor: colors.mintSoft, borderRadius: 18, padding: 14, gap: 8 },
  code: { fontSize: 26, fontWeight: '800', letterSpacing: 1, color: colors.ink },
});
