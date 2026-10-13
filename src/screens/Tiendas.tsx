import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Fachada } from '../components/art';
import { ReserveSheet, ReserveTarget } from '../components/ReserveSheet';
import { Badge, Button, Card, Chip, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Menu, Offer, Shop } from '../lib/types';
import { colors, eur, hhmm } from '../theme';
import { offerBadge } from './VecinoHoy';

type Filtro = 'todas' | 'sigo' | 'tiendas' | 'restaurantes' | 'domicilio';

export default function Tiendas({ openShopId, onCloseShop, onOpenShop, verified }: { openShopId: string | null; onCloseShop: () => void; onOpenShop: (id: string) => void; verified: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [target, setTarget] = useState<ReserveTarget | null>(null);
  const [follows, setFollows] = useState<string[]>([]);
  const [fans, setFans] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const [s, o, m, f, c] = await Promise.all([repo.shops(), repo.liveOffers(), repo.liveMenus(), repo.follows().catch(() => [] as string[]), repo.followerCounts().catch(() => ({}))]);
      setShops(s); setOffers(o); setMenus(m); setFollows(f); setFans(c);
    } catch (e: any) {
      Alert.alert('No se ha podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const toggleFollow = async (id: string) => {
    const on = follows.includes(id);
    setFollows((x) => (on ? x.filter((y) => y !== id) : [...x, id]));
    try { if (on) await repo.unfollow(id); else await repo.follow(id); } catch (e: any) { Alert.alert('No se ha podido', e.message); load(); }
  };
  const done = (msg: string) => { setTarget(null); load(); Alert.alert('Reservado', msg); };
  const open = openShopId ? shops.find((s) => s.id === openShopId) : null;

  if (open) {
    return (
      <View style={{ flex: 1 }}>
        <ShopDetail shop={open} offers={offers.filter((o) => o.shop_id === open.id)} menu={menus.find((m) => m.shop_id === open.id)} onBack={onCloseShop} onReserve={setTarget} following={follows.includes(open.id)} fans={fans[open.id] ?? 0} onFollow={() => toggleFollow(open.id)} />
        <ReserveSheet target={target} onClose={() => setTarget(null)} onDone={done} />
      </View>
    );
  }

  if (!verified) {
    return (
      <View style={st.empty}>
        <Text style={T.h1}>Primero, confirma que eres del barrio</Text>
        <Text style={T.small}>Pide tu código en Mi calle y enséñalo en una tienda. Después verás todas las tiendas de tu calle.</Text>
      </View>
    );
  }

  const list = shops.filter((s) => filtro === 'todas' || (filtro === 'sigo' && follows.includes(s.id)) || (filtro === 'tiendas' && s.tipo === 'tienda') || (filtro === 'restaurantes' && s.tipo === 'restaurante') || (filtro === 'domicilio' && s.delivery_enabled));

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View>
        <Text style={T.kicker}>COMERCIO INDEPENDIENTE DE TU CALLE</Text>
        <Text style={T.title}>Tiendas</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Todas" on={filtro === 'todas'} onPress={() => setFiltro('todas')} />
        <Chip label="Las que sigo" on={filtro === 'sigo'} onPress={() => setFiltro('sigo')} />
        <Chip label="Tiendas" on={filtro === 'tiendas'} onPress={() => setFiltro('tiendas')} />
        <Chip label="Restaurantes" on={filtro === 'restaurantes'} onPress={() => setFiltro('restaurantes')} />
        <Chip label="A domicilio" on={filtro === 'domicilio'} onPress={() => setFiltro('domicilio')} />
      </ScrollView>
      {list.length === 0 && !loading && <Note>Todavía no hay tiendas aquí. Las damos de alta en persona, una a una.</Note>}
      <View style={st.group}>
        {list.map((s, i) => {
          const n = offers.filter((o) => o.shop_id === s.id).length;
          const m = menus.find((x) => x.shop_id === s.id);
          return (
            <Pressable key={s.id} accessibilityRole="button" onPress={() => onOpenShop(s.id)} style={({ pressed }) => [st.row, i > 0 && st.sep, pressed && { opacity: 0.7 }]}>
              <Fachada kind={s.fachada} name={s.name} width={84} height={64} style={{ borderRadius: 12 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.strong}>{s.name}</Text>
                <Text style={T.small}>{s.tipo === 'restaurante' ? 'Restaurante' : 'Tienda'}{s.delivery_enabled ? ' · recogida y a domicilio' : ' · recogida'}{s.barrio && s.barrio !== 'Palos de la Frontera' ? ` · ${s.barrio}` : ''}</Text>
                {!!s.hours && <Text style={[T.small, { color: colors.green, fontWeight: '600' }]}>{s.hours}</Text>}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                  {m && <Badge label={`Menú · quedan ${m.qty_left}`} color={colors.wine} soft={colors.wineSoft} />}
                  {n > 0 && <Badge label={n === 1 ? '1 oferta' : `${n} ofertas`} color={colors.red} soft={colors.redSoft} />}
                  {follows.includes(s.id) && <Badge label="La sigues" color={colors.green} soft={colors.greenSoft} />}
                </View>
              </View>
              <Text style={{ color: colors.faint, fontSize: 18 }}>›</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[T.small, { textAlign: 'center' }]}>Sin cadenas ni franquicias. Nunca ordenamos por precio.</Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function ShopDetail({ shop, offers, menu, onBack, onReserve, following, fans, onFollow }: { shop: Shop; offers: Offer[]; menu?: Menu; onBack: () => void; onReserve: (t: ReserveTarget) => void; following: boolean; fans: number; onFollow: () => void }) {
  const { width } = useWindowDimensions();
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <View>
        <Fachada kind={shop.fachada} name={shop.name} width={width} height={Math.round(width * 0.56)} />
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={st.back}><Text style={{ fontSize: 26, color: colors.ink, marginTop: -3 }}>‹</Text></Pressable>
      </View>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={T.h1}>{shop.name}</Text>
            <Badge label="Verificada" color={colors.green} soft={colors.greenSoft} />
          </View>
          {!!shop.hours && <Text style={[T.small, { color: colors.green, fontWeight: '600' }]}>{shop.hours}</Text>}
          <Text style={T.small}>{shop.street}{shop.barrio ? ` · ${shop.barrio}` : ''}{fans ? ` · la siguen ${fans} ${fans === 1 ? 'vecino' : 'vecinos'}` : ''}</Text>
        </View>
        <Button label={following ? 'Siguiendo · te avisa la primera' : 'Seguir esta tienda'} tone={following ? 'soft' : 'primary'} onPress={onFollow} />

        {menu && (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={T.h2}>Menú del día</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Text style={T.strong}>{eur(menu.price_cents)}</Text>
                <Badge label={`Quedan ${menu.qty_left}`} color={colors.wine} />
              </View>
            </View>
            <Text style={T.body}><Text style={T.strong}>Primero: </Text>{menu.starters}</Text>
            <Text style={T.body}><Text style={T.strong}>Segundo: </Text>{menu.mains}</Text>
            {!!menu.includes && <Text style={T.small}>{menu.includes}</Text>}
            <Text style={[T.small, { fontWeight: '700' }]}>ALÉRGENOS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {menu.allergens.length === 0 ? <Text style={T.small}>Sin alérgenos de declaración obligatoria</Text> : menu.allergens.map((a) => <Badge key={a} label={a} color="#8A5A12" soft={colors.goldSoft} />)}
            </View>
            <Text style={T.small}>Hasta las {hhmm(menu.until)} · se cierra solo al llegar a 0</Text>
            <Button label="Reservar mi menú" tone="wine" onPress={() => onReserve({ type: 'menu', menu, shop })} />
          </Card>
        )}

        <Label>{offers.length ? 'Ofertas de hoy' : 'Hoy no tiene ofertas'}</Label>
        {offers.map((o) => {
          const b = offerBadge(o);
          return (
            <Card key={o.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.h2}>{o.title}</Text>
                  <Text style={T.small}>Quedan {o.qty_left} · hasta las {hhmm(o.until)}</Text>
                </View>
                <Badge label={b.label} color={b.color} soft={b.soft} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{eur(o.price_cents)}</Text>
                {o.kind === 'rebaja' && !!o.old_price_cents && <Text style={[T.small, { textDecorationLine: 'line-through' }]}>{eur(o.old_price_cents)}</Text>}
                <Text style={T.small}>{o.unit}</Text>
              </View>
              <Button label="Reservar" onPress={() => onReserve({ type: 'offer', offer: o, shop })} />
            </Card>
          );
        })}

        <Label>Cómo te lo dan</Label>
        <View style={st.group}>
          <View style={st.line}><Text style={[T.body, { flex: 1 }]}>Recogida en {shop.tipo === 'restaurante' ? 'el local' : 'la tienda'}</Text><Text style={T.small}>Gratis</Text></View>
          <View style={[st.line, st.sep]}>
            <View style={{ flex: 1 }}>
              <Text style={T.body}>A domicilio</Text>
              {shop.delivery_enabled && <Text style={T.small}>{shop.delivery_by ? `Lo lleva ${shop.delivery_by}` : 'Lo lleva alguien de la tienda'}{shop.delivery_slots.length ? ' · ' + shop.delivery_slots.join(', ') : ''}</Text>}
            </View>
            <Text style={T.small}>{shop.delivery_enabled ? `${shop.delivery_fee_cents ? eur(shop.delivery_fee_cents) : 'Gratis'}${shop.delivery_free_from_cents ? ` · gratis desde ${eur(shop.delivery_free_from_cents)}` : ''}` : 'No'}</Text>
          </View>
        </View>

        {!!shop.about && (
          <>
            <Label>Quién está detrás</Label>
            <Card><Text style={[T.body, { color: '#3D434A' }]}>{shop.about}</Text></Card>
          </>
        )}
        <Note>{`Pagas en ${shop.tipo === 'restaurante' ? 'el local' : 'la tienda'} o al recibirlo. Nunca en la app.`}</Note>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  empty: { flex: 1, padding: 24, justifyContent: 'center', gap: 8 },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  back: { position: 'absolute', left: 16, top: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center' },
});
