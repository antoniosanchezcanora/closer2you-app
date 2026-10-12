import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Calle } from '../components/art';
import { ReserveSheet, ReserveTarget } from '../components/ReserveSheet';
import { Badge, Button, Card, Initial, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Me, Menu, MenuReservation, Offer, Reservation, ReservationStatus, Shop } from '../lib/types';
import { colors, eur, hhmm } from '../theme';

const STATUS: Record<ReservationStatus, { text: string; color: string; soft: string }> = {
  nueva: { text: 'Esperando a la tienda', color: colors.gold, soft: colors.goldSoft },
  lista: { text: 'Preparada', color: colors.green, soft: colors.greenSoft },
  recogida: { text: 'Hecho', color: colors.muted, soft: '#EEEFF1' },
  rechazada: { text: 'No le quedaba', color: colors.muted, soft: '#EEEFF1' },
  cancelada: { text: 'Cancelada', color: colors.muted, soft: '#EEEFF1' },
  no_show: { text: 'No pasaste', color: colors.muted, soft: '#EEEFF1' },
};
const MENU_MODE = { aqui: 'Comes allí', llevar: 'Para llevar', entrega: 'Te lo traen' } as const;

export function offerBadge(o: Offer) {
  if (o.kind === 'lote') return { label: 'Lote', color: colors.gold, soft: colors.goldSoft };
  if (o.kind === 'novedad') return { label: 'Novedad', color: colors.green, soft: colors.greenSoft };
  if (o.old_price_cents) return { label: `-${Math.round(100 - (o.price_cents * 100) / o.old_price_cents)}%`, color: colors.red, soft: undefined };
  return { label: 'Oferta', color: colors.red, soft: undefined };
}

type Group = { shopId: string; shopName?: string; latest: string; offers: Offer[]; menu?: Menu };

export default function VecinoHoy({ me, onVerified, onSignOut, onOpenShop }: { me: Me | null; onVerified: () => void; onSignOut: () => void; onOpenShop: (shopId: string) => void }) {
  const { width } = useWindowDimensions();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [mine, setMine] = useState<Reservation[]>([]);
  const [mineMenus, setMineMenus] = useState<MenuReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [target, setTarget] = useState<ReserveTarget | null>(null);

  const verified = !!me?.verified;

  const load = useCallback(async () => {
    try {
      const [o, m, s, r, mr] = await Promise.all([repo.liveOffers(), repo.liveMenus(), repo.shops(), repo.myReservations(), repo.myMenuReservations()]);
      setOffers(o); setMenus(m); setShops(s); setMine(r); setMineMenus(mr);
    } catch (e: any) {
      Alert.alert('No se ha podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga al abrir; la llamada va en una microtarea para no encadenar renders.
  useEffect(() => { Promise.resolve().then(load); }, [load, verified]);

  const refresh = () => { load(); onVerified(); };
  const shopById = (id: string) => shops.find((s) => s.id === id);

  const askCode = async () => {
    try { setCode(await repo.requestShopCode()); } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const mute = (shopId: string, name?: string) => {
    Alert.alert('Silenciar', `No verás más publicaciones de ${name ?? 'esta tienda'} en tu calle.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Silenciar', style: 'destructive', onPress: async () => { try { await repo.muteShop(shopId); await load(); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  };

  // Una tarjeta por tienda (con su menú y sus ofertas), por orden de hora. Nunca por precio.
  const groups = Object.values(
    [...offers.map((o) => ({ shopId: o.shop_id, shopName: o.shop_name, at: o.created_at ?? '', offer: o })), ...menus.map((m) => ({ shopId: m.shop_id, shopName: m.shop_name, at: m.created_at, menu: m }))]
      .reduce<Record<string, Group>>((acc, it) => {
        const g = (acc[it.shopId] ??= { shopId: it.shopId, shopName: it.shopName, latest: it.at, offers: [] });
        if ('offer' in it && it.offer) g.offers.push(it.offer);
        if ('menu' in it && it.menu) g.menu = it.menu;
        if (it.at > g.latest) g.latest = it.at;
        return acc;
      }, {}),
  ).sort((a, b) => (a.latest < b.latest ? 1 : -1));

  const activas = mine.filter((r) => r.status === 'nueva' || r.status === 'lista');
  const activasMenu = mineMenus.filter((r) => r.status === 'nueva' || r.status === 'lista');
  const pasadas = mine.filter((r) => r.status !== 'nueva' && r.status !== 'lista').slice(0, 5);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
        <View style={st.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.kicker}>TU CALLE AHORA</Text>
            <Text style={T.title}>General Lacy</Text>
            {verified && me?.verifiedBy ? <Badge label={`Verificado por ${me.verifiedBy}`} color={colors.green} soft={colors.greenSoft} /> : null}
          </View>
          {me ? <Initial name={me.name} size={44} /> : null}
          <Button small label="Salir" tone="soft" onPress={() => Alert.alert('Salir', '¿Cerrar la sesión en este móvil?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', onPress: onSignOut },
          ])} />
        </View>

        <View style={st.street}>
          <Calle width={width} />
          {verified && (offers.length > 0 || menus.length > 0) && (
            <View style={st.streetPill}><Text style={st.streetPillText}>{offers.length + menus.length} {offers.length + menus.length === 1 ? 'cosa nueva' : 'cosas nuevas'} hoy en tu calle</Text></View>
          )}
        </View>

        {!verified && (
          <Card tint={colors.greenSoft} style={{ gap: 10 }}>
            <Text style={[T.h2, { color: '#1F4A37' }]}>Confirma que eres del barrio</Text>
            <Text style={[T.body, { color: '#1F4A37', fontSize: 15 }]}>Pide tu código y enséñalo en cualquier tienda de Stoop. Cuando te confirmen, verás lo que pasa en tu calle.</Text>
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

        {(activas.length > 0 || activasMenu.length > 0) && (
          <>
            <Label>Tus reservas</Label>
            <View style={st.group}>
              {activasMenu.map((r, i) => (
                <View key={r.id} style={[st.resRow, i > 0 && st.sep]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={T.strong}>{r.qty > 1 ? `${r.qty} menús` : 'Menú del día'} · {r.at_time}</Text>
                    <Text style={T.small}>{r.shop_name} · {MENU_MODE[r.mode]}</Text>
                    <Badge label={STATUS[r.status].text} color={STATUS[r.status].color} soft={STATUS[r.status].soft} />
                  </View>
                  <Button small label="Cancelar" tone="ghost" onPress={async () => { try { await repo.cancelMenu(r.id); load(); } catch (e: any) { Alert.alert('Error', e.message); } }} />
                </View>
              ))}
              {activas.map((r, i) => (
                <View key={r.id} style={[st.resRow, (i > 0 || activasMenu.length > 0) && st.sep]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={T.strong}>{r.qty > 1 ? `${r.qty} × ` : ''}{r.offer_title}</Text>
                    <Text style={T.small}>{r.shop_name} · {r.mode === 'entrega' ? `Te lo traen${r.delivery_slot ? ' de ' + r.delivery_slot : ''}` : 'Lo recoges tú'}</Text>
                    <Badge label={r.mode === 'entrega' && r.status === 'lista' ? 'En camino' : STATUS[r.status].text} color={STATUS[r.status].color} soft={STATUS[r.status].soft} />
                  </View>
                  <Button small label="Cancelar" tone="ghost" onPress={async () => { try { await repo.cancel(r.id); load(); } catch (e: any) { Alert.alert('Error', e.message); } }} />
                </View>
              ))}
            </View>
          </>
        )}

        {verified && <Label>Hoy en tu calle</Label>}
        {groups.map((g) => {
          const shop = shopById(g.shopId);
          return (
            <Card key={g.shopId} style={{ gap: 0, paddingVertical: 6 }}>
              <View style={st.shopHead}>
                <Initial name={g.shopName ?? 'T'} size={36} square />
                <View style={{ flex: 1 }}>
                  <Text style={T.strong} onPress={() => onOpenShop(g.shopId)}>{g.shopName}</Text>
                  <Text style={T.small}>{hhmm(g.latest)}{shop?.delivery_enabled ? ' · también a domicilio' : ''}</Text>
                </View>
                <Button small label="Ver" tone="soft" onPress={() => onOpenShop(g.shopId)} />
              </View>
              {g.menu && (
                <View style={[st.offer, st.sep]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Badge label={`Menú del día · quedan ${g.menu.qty_left}`} color={colors.wine} soft={colors.wineSoft} />
                    <Text style={T.strong}>{g.menu.starters}; {g.menu.mains}</Text>
                    <Text style={st.price}>{eur(g.menu.price_cents)}</Text>
                  </View>
                  <Button small label="Reservar" tone="wine" onPress={() => setTarget({ type: 'menu', menu: g.menu!, shop })} />
                </View>
              )}
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
                    <Button small label="Reservar" onPress={() => setTarget({ type: 'offer', offer: o, shop })} />
                  </View>
                );
              })}
              <Text style={st.mute} onPress={() => mute(g.shopId, g.shopName)}>Silenciar</Text>
            </Card>
          );
        })}

        {verified && !loading && (
          <View style={st.done}>
            <Text style={T.h2}>{groups.length === 0 ? 'Hoy todavía no hay nada' : 'Ya estás al día'}</Text>
            <Text style={[T.small, { textAlign: 'center' }]}>{groups.length === 0 ? 'Las tiendas suelen publicar por la tarde. Mira la pestaña Tiendas.' : 'Esto es todo lo que ha pasado hoy en tu calle. Mañana habrá más.'}</Text>
          </View>
        )}

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
        <Note>Reservas aquí y pagas en la tienda. Nunca pagas en la app.</Note>
        <View style={{ height: 24 }} />
      </ScrollView>
      <ReserveSheet target={target} onClose={() => setTarget(null)} onDone={(msg) => { setTarget(null); load(); Alert.alert('Reservado', msg); }} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  street: { marginHorizontal: -16, marginTop: -8, marginBottom: -24 },
  streetPill: { position: 'absolute', left: 16, bottom: 34, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)' },
  streetPillText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  shopHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 19, fontWeight: '700', color: colors.ink },
  mute: { alignSelf: 'flex-end', fontSize: 13, color: colors.faint, paddingVertical: 8 },
  done: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9CDD3', borderRadius: 16, padding: 20, alignItems: 'center', gap: 6, marginTop: 4 },
  codeBox: { backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 4, alignItems: 'center' },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 2, color: colors.ink },
});
