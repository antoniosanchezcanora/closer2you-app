import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Calle } from '../components/art';
import { ReserveSheet, ReserveTarget } from '../components/ReserveSheet';
import { Badge, Button, Card, Initial, Label, Note, Segment, T } from '../components/ui';
import Agenda from './Agenda';
import { repo } from '../lib/repo';
import type { Me, Menu, MenuReservation, Offer, PresencePerson, Reservation, ReservationStatus, Shop } from '../lib/types';
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

export default function VecinoHoy({ me, myShop, unread, onVerified, onAvisos, onOpenShop, onChatWith }: { me: Me | null; myShop: Shop | null; unread: number; onVerified: () => void; onAvisos: () => void; onOpenShop: (shopId: string) => void; onChatWith: (userId: string) => void }) {
  const [seg, setSeg] = useState<'barrio' | 'plaza' | 'ciudad' | 'agenda'>('barrio');
  const [follows, setFollows] = useState<string[]>([]);
  const [discover, setDiscover] = useState(false);
  const [lit, setLit] = useState<PresencePerson[]>([]);
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
      const [o, m, s, r, mr, f] = await Promise.all([repo.liveOffers(), repo.liveMenus(), repo.shops(), repo.myReservations(), repo.myMenuReservations(), repo.follows().catch(() => [] as string[])]);
      setOffers(o); setMenus(m); setShops(s); setMine(r); setMineMenus(mr); setFollows(f);
      repo.peoplePresence().then((x) => setLit(x.filter((y) => y.online || y.awake))).catch(() => setLit([]));
    } catch (e: any) {
      Alert.alert('No se ha podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga al abrir; la llamada va en una microtarea para no encadenar renders.
  useEffect(() => { Promise.resolve().then(load); }, [load, verified]);

  const refresh = () => { load(); onVerified(); };
  // Las ventanas se refrescan solas cada minuto mientras miras la calle.
  useEffect(() => {
    if (!me?.fase2) return;
    const t = setInterval(() => { repo.peoplePresence().then((x) => setLit(x.filter((y) => y.online || y.awake))).catch(() => {}); }, 60000);
    return () => clearInterval(t);
  }, [me?.fase2]);
  const pressWindow = (id: string) => {
    const p = lit.find((x) => x.other_id === id);
    if (!p) return;
    Alert.alert(p.name, p.awake ? 'Está despierto y se puede hablar.' : 'Tiene Stoop abierto ahora mismo.', [
      { text: 'Cerrar', style: 'cancel' },
      { text: 'Escribir', onPress: () => onChatWith(id) },
    ]);
  };
  const shopById = (id: string) => shops.find((s) => s.id === id);

  const myBarrio = me?.barrio ?? 'Palos de la Frontera';
  const follows_ = new Set(follows);
  const inBarrio = (id: string) => (shopById(id)?.barrio ?? myBarrio) === myBarrio;
  const toggleFollow = async (shopId: string) => {
    const on = follows_.has(shopId);
    setFollows((x) => (on ? x.filter((y) => y !== shopId) : [...x, shopId]));
    try { if (on) await repo.unfollow(shopId); else await repo.follow(shopId); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); load(); }
  };

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
  const shown = groups.filter((g) => (seg === 'barrio' ? follows_.has(g.shopId) && inBarrio(g.shopId) : seg === 'plaza' ? inBarrio(g.shopId) : seg === 'ciudad' ? follows_.has(g.shopId) && !inBarrio(g.shopId) : false));
  const barrioShops = shops.filter((x) => (x.barrio ?? myBarrio) === myBarrio);
  const otherShops = shops.filter((x) => (x.barrio ?? myBarrio) !== myBarrio);
  const followedHere = barrioShops.filter((x) => follows_.has(x.id));
  const followedAway = otherShops.filter((x) => follows_.has(x.id));

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
          <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Avisos, ${unread} sin leer` : 'Avisos'} onPress={onAvisos} style={st.bell}>
            <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M7 16 V11 A5 5 0 0 1 17 11 V16 L18.5 17.5 H5.5 Z M10.5 19.5 A1.6 1.6 0 0 0 13.5 19.5" fill="none" stroke={colors.ink} strokeWidth={1.9} strokeLinejoin="round" /></Svg>
            {unread > 0 && <View style={st.bellDot}><Text style={st.bellNum}>{unread > 9 ? '9+' : unread}</Text></View>}
          </Pressable>
          {me ? <Initial name={me.name} size={44} /> : null}
        </View>

        <View style={st.street}>
          <Calle width={width} lit={lit.map((p) => ({ id: p.other_id, name: p.name, awake: p.awake, online: p.online }))} onPressWindow={pressWindow} />
          {verified && groups.length > 0 && (
            <View style={st.streetPill}><Text style={st.streetPillText}>{groups.filter((g) => inBarrio(g.shopId)).length} {groups.filter((g) => inBarrio(g.shopId)).length === 1 ? 'tienda ha publicado' : 'tiendas han publicado'} hoy en el barrio</Text></View>
          )}
        </View>
        {lit.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => (lit.length === 1 ? pressWindow(lit[0].other_id) : Alert.alert('Con la luz encendida', '¿A quién quieres escribir?', [...lit.slice(0, 4).map((p) => ({ text: p.name, onPress: () => onChatWith(p.other_id) })), { text: 'Cerrar', style: 'cancel' as const }]))} style={st.litRow}>
            <View style={st.litDot} />
            <Text style={[T.small, { color: colors.ink, flex: 1 }]}>{lit.length === 1 ? `${lit[0].name} tiene la luz encendida` : `${lit.map((p) => p.name).join(', ')} tienen la luz encendida`}. Toca su ventana para escribirle.</Text>
          </Pressable>
        )}

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

        {verified && <Segment items={[{ id: 'barrio', label: 'Mi barrio' }, { id: 'plaza', label: 'La plaza' }, { id: 'ciudad', label: 'Mi ciudad' }, { id: 'agenda', label: 'Agenda' }]} value={seg} onChange={(k) => { setSeg(k); setDiscover(false); }} />}
        {seg === 'agenda' && <Agenda me={me} shop={myShop} />}
        {verified && seg === 'barrio' && <Text style={T.small}>{followedHere.length === 0 ? 'Tu barrio lo haces tú: sigue las tiendas que te gustan y te avisamos las primeras cuando publiquen.' : `Sigues ${followedHere.length} ${followedHere.length === 1 ? 'tienda' : 'tiendas'} de ${myBarrio}. Te avisan antes que a nadie.`}</Text>}
        {verified && seg === 'plaza' && <Text style={T.small}>Todo lo publicado hoy en {myBarrio}, sigas a la tienda o no. Por orden de hora, nunca por quién paga.</Text>}
        {verified && seg === 'ciudad' && <Text style={T.small}>Las tiendas que sigues fuera de tu barrio. Tu gente de otros barrios está en Vecinos, Mi gente.</Text>}
        {verified && ((seg === 'barrio' && (followedHere.length === 0 || discover)) || (seg === 'ciudad' && (followedAway.length === 0 || discover))) && (
          <Card style={{ gap: 8 }}>
            <Text style={T.h2}>{seg === 'barrio' ? `Tiendas de ${myBarrio}` : 'Tiendas de otros barrios'}</Text>
            {(seg === 'barrio' ? barrioShops : otherShops).length === 0 && <Text style={T.small}>Todavía no hay tiendas de otros barrios en Stoop.</Text>}
            {(seg === 'barrio' ? barrioShops : otherShops).map((x) => (
              <View key={x.id} style={st.followRow}>
                <Initial name={x.name} size={34} square />
                <View style={{ flex: 1 }}><Text style={T.strong} onPress={() => onOpenShop(x.id)}>{x.name}</Text><Text style={T.small}>{x.street}{x.barrio !== myBarrio ? ` · ${x.barrio}` : ''}</Text></View>
                <Button small label={follows_.has(x.id) ? 'Siguiendo' : 'Seguir'} tone={follows_.has(x.id) ? 'soft' : 'primary'} onPress={() => toggleFollow(x.id)} />
              </View>
            ))}
            {discover && <Button small label="Listo" tone="soft" onPress={() => setDiscover(false)} />}
          </Card>
        )}
        {verified && (seg === 'barrio' || seg === 'ciudad') && !discover && (seg === 'barrio' ? followedHere : followedAway).length > 0 && (
          <Text style={[T.small, { color: colors.green, fontWeight: '600' }]} onPress={() => setDiscover(true)}>{seg === 'barrio' ? '+ Seguir más tiendas del barrio' : '+ Seguir tiendas de otros barrios'}</Text>
        )}
        {seg !== 'agenda' && shown.map((g) => {
          const shop = shopById(g.shopId);
          return (
            <Card key={g.shopId} style={{ gap: 0, paddingVertical: 6 }}>
              <View style={st.shopHead}>
                <Initial name={g.shopName ?? 'T'} size={36} square />
                <View style={{ flex: 1 }}>
                  <Text style={T.strong} onPress={() => onOpenShop(g.shopId)}>{g.shopName}</Text>
                  <Text style={T.small}>{hhmm(g.latest)}{shop && shop.barrio !== myBarrio ? ` · ${shop.barrio}` : ''}{shop?.delivery_enabled ? ' · también a domicilio' : ''}</Text>
                </View>
                {follows_.has(g.shopId)
                  ? <Badge label="La sigues" color={colors.green} soft={colors.greenSoft} />
                  : <Button small label="Seguir" tone="soft" onPress={() => toggleFollow(g.shopId)} />}
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

        {seg !== 'agenda' && verified && !loading && !(seg === 'ciudad' && followedAway.length === 0) && !(seg === 'barrio' && followedHere.length === 0) && (
          <View style={st.done}>
            <Text style={T.h2}>{shown.length === 0 ? 'Hoy todavía no hay nada' : 'Ya estás al día'}</Text>
            <Text style={[T.small, { textAlign: 'center' }]}>
              {shown.length === 0
                ? (seg === 'barrio' ? 'Tus tiendas aún no han publicado hoy. Mira La plaza por si hay algo de otras.' : 'Las tiendas suelen publicar por la tarde.')
                : seg === 'barrio' ? 'Esto es lo de tus tiendas hoy. En La plaza está todo lo del barrio.' : 'Esto es todo por hoy. Mañana habrá más.'}
            </Text>
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
  litRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF6DE', borderRadius: 12, padding: 10, marginTop: 24 },
  litDot: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#FFC24A' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  done: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9CDD3', borderRadius: 16, padding: 20, alignItems: 'center', gap: 6, marginTop: 4 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', right: -2, top: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellNum: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  codeBox: { backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 4, alignItems: 'center' },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 2, color: colors.ink },
});
