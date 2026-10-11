import { supabase } from './supabase';
import type { NewOffer, Offer, Repo, Reservation, ReservationStatus, Shop } from './types';

// ------------------------------------------------------------------
// Demostración: una frutería de ejemplo con datos en memoria.
// Sirve para enseñar la app en la calle antes de tener datos reales.
// ------------------------------------------------------------------
function demoRepo(): Repo {
  const now = Date.now();
  const at = (min: number) => new Date(now + min * 60000).toISOString();
  const shop: Shop = { id: 's1', name: 'Frutería Lacy', category: 'fruteria', street: 'General Lacy', hours: 'Hasta las 20:30', free_reservations_used: 6 };
  const offers: Offer[] = [
    { id: 'o1', shop_id: 's1', shop_name: shop.name, title: 'Manzanas reineta', unit: 'el kilo', price_cents: 168, old_price_cents: 240, qty_left: 8, until: at(240) },
    { id: 'o2', shop_id: 's1', shop_name: shop.name, title: 'Caja sorpresa de fruta', unit: 'unos 3 kg', price_cents: 350, old_price_cents: 700, qty_left: 4, until: at(240) },
    { id: 'o3', shop_id: 's2', shop_name: 'Horno de la esquina', title: 'Pan del día', unit: 'la barra', price_cents: 60, old_price_cents: 120, qty_left: 10, until: at(120) },
  ];
  const res: Reservation[] = [
    { id: 'r1', offer_id: 'o1', shop_id: 's1', offer_title: 'Manzanas reineta', neighbour_name: 'Marta', qty: 1, pickup_at: at(30), note: null, status: 'nueva', created_at: at(-20) },
    { id: 'r2', offer_id: 'o2', shop_id: 's1', offer_title: 'Caja sorpresa de fruta', neighbour_name: 'Dani', qty: 1, pickup_at: at(60), note: null, status: 'nueva', created_at: at(-15) },
    { id: 'r3', offer_id: 'o1', shop_id: 's1', offer_title: 'Naranjas de zumo, 2 kg', neighbour_name: 'Pilar', qty: 1, pickup_at: at(90), note: 'Pide si se lo puede subir alguien. Vive a dos portales.', status: 'nueva', created_at: at(-10) },
    { id: 'r4', offer_id: 'o1', shop_id: 's1', offer_title: 'Fresas, 500 g', neighbour_name: 'Lucía', qty: 1, pickup_at: at(105), note: null, status: 'lista', created_at: at(-40) },
  ];
  const mine: Reservation[] = [];
  const wait = () => new Promise((r) => setTimeout(r, 150));
  const find = (id: string) => res.find((r) => r.id === id) || mine.find((r) => r.id === id);

  return {
    mode: 'demo',
    async liveOffers() { await wait(); return offers.filter((o) => o.qty_left > 0).map((o) => ({ ...o })); },
    async reserve(offerId, qty, note) {
      await wait();
      const o = offers.find((x) => x.id === offerId);
      if (!o || o.qty_left < qty) throw new Error('No quedan suficientes unidades');
      o.qty_left -= qty;
      const r: Reservation = { id: 'm' + Date.now(), offer_id: o.id, shop_id: o.shop_id, offer_title: o.title, shop_name: o.shop_name, neighbour_name: 'Tú', qty, pickup_at: null, note: note || null, status: 'nueva', created_at: new Date().toISOString() };
      mine.unshift(r);
      if (o.shop_id === shop.id) res.unshift({ ...r });
    },
    async myReservations() { await wait(); return mine.map((r) => ({ ...r, status: res.find((x) => x.id === r.id)?.status ?? r.status })); },
    async cancel(id) { await wait(); const r = find(id); if (r) r.status = 'cancelada'; const s = res.find((x) => x.id === id); if (s) s.status = 'cancelada'; },
    async requestShopCode() { await wait(); return 'LACY-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0'); },
    async myShop() { await wait(); return { ...shop }; },
    async shopReservations() { await wait(); return res.map((r) => ({ ...r })); },
    async setStatus(id, status) {
      await wait();
      const r = res.find((x) => x.id === id);
      if (!r) return;
      r.status = status;
      if (status === 'recogida') shop.free_reservations_used = Math.min(10, shop.free_reservations_used + 1);
    },
    async publishOffer(n: NewOffer) {
      await wait();
      offers.unshift({ id: 'o' + Date.now(), shop_id: shop.id, shop_name: shop.name, ...n });
    },
    async confirmNeighbour(code) {
      await wait();
      if (!/^LACY-\d{4}$/i.test(code.trim())) throw new Error('Código no válido');
      return 'Vecino';
    },
  };
}

// ------------------------------------------------------------------
// Supabase: las reglas (stock, estados, contador) viven en la base de datos.
// ------------------------------------------------------------------
function liveRepo(): Repo {
  const sb = supabase!;
  const ok = <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const RES_COLS = 'id, offer_id, shop_id, qty, pickup_at, note, status, created_at, offers(title), shops(name), profiles(display_name)';
  const mapRes = (r: any): Reservation => ({
    id: r.id, offer_id: r.offer_id, shop_id: r.shop_id, qty: r.qty, pickup_at: r.pickup_at, note: r.note, status: r.status, created_at: r.created_at,
    offer_title: r.offers?.title ?? '', shop_name: r.shops?.name, neighbour_name: r.profiles?.display_name ?? 'Vecino',
  });
  const uid = async () => {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error('Sin sesión');
    return data.user.id;
  };
  let shopCache: Shop | null = null;

  return {
    mode: 'live',
    async liveOffers() {
      const rows = ok(await sb.from('offers').select('id, shop_id, title, unit, price_cents, old_price_cents, qty_left, until, shops(name)').gt('qty_left', 0).order('created_at', { ascending: false }));
      return (rows as any[]).map((o) => ({ ...o, shop_name: o.shops?.name }));
    },
    async reserve(offerId, qty, note) {
      // shop_id lo rellena el trigger a partir de la oferta
      ok(await sb.from('reservations').insert({ offer_id: offerId, shop_id: '00000000-0000-0000-0000-000000000000', neighbour_id: await uid(), qty, note: note || null }));
    },
    async myReservations() {
      const rows = ok(await sb.from('reservations').select(RES_COLS).eq('neighbour_id', await uid()).order('created_at', { ascending: false }).limit(30));
      return (rows as any[]).map(mapRes);
    },
    async cancel(id) { ok(await sb.from('reservations').update({ status: 'cancelada' }).eq('id', id)); },
    async requestShopCode() { return ok(await sb.rpc('request_shop_code')) as string; },
    async myShop() {
      const rows = ok(await sb.from('shops').select('id, name, category, street, hours, free_reservations_used').eq('owner_id', await uid()).limit(1));
      shopCache = (rows as Shop[])[0] ?? null;
      return shopCache;
    },
    async shopReservations() {
      const shop = shopCache ?? (await this.myShop());
      if (!shop) return [];
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const rows = ok(await sb.from('reservations').select(RES_COLS).eq('shop_id', shop.id).gte('created_at', since).order('created_at', { ascending: false }));
      return (rows as any[]).map(mapRes);
    },
    async setStatus(id, status: ReservationStatus) { ok(await sb.from('reservations').update({ status }).eq('id', id)); },
    async publishOffer(n) {
      const shop = shopCache ?? (await this.myShop());
      if (!shop) throw new Error('No tienes una tienda dada de alta');
      ok(await sb.from('offers').insert({ shop_id: shop.id, ...n }));
    },
    async confirmNeighbour(code) { return ok(await sb.rpc('confirm_neighbour', { p_code: code })) as string; },
  };
}

export const repo: Repo = supabase ? liveRepo() : demoRepo();
