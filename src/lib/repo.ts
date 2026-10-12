import { supabase } from './supabase';
import { MAX_OFERTAS_ACTIVAS, MAX_OFERTAS_DIA } from './types';
import type { Me, Menu, MenuReservation, NewOffer, Offer, Repo, Reservation, ReservationStatus, Shop } from './types';

const madridDay = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
// Fecha de hoy en Madrid como AAAA-MM-DD (la columna "day" de los menús).
export const madridISODate = () => {
  const p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
};
const isLive = (o: Offer) => o.active !== false && o.qty_left > 0 && new Date(o.until).getTime() > Date.now();
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

const baseShop = {
  about: null, delivery_enabled: false, delivery_fee_cents: 0, delivery_free_from_cents: null, delivery_radius_m: 500, delivery_slots: [] as string[], delivery_by: null,
};

// ------------------------------------------------------------------
// Demostración: tiendas de ejemplo con datos en memoria.
// Sirve para enseñar la app en la calle antes de tener datos reales.
// ------------------------------------------------------------------
function demoRepo(): Repo {
  const now = Date.now();
  const at = (min: number) => new Date(now + min * 60000).toISOString();
  const shops: Shop[] = [
    { ...baseShop, id: 's1', name: 'Frutería Carmen', category: 'fruteria', street: 'General Lacy', hours: 'Abierta hasta las 21:00', free_reservations_used: 6, tipo: 'tienda', fachada: 'fruta',
      about: 'Fruta de temporada, mucha de huerta madrileña. Si me pides algo que no tengo, te lo traigo.', delivery_enabled: true, delivery_fee_cents: 150, delivery_free_from_cents: 2000, delivery_slots: ['19:00 a 21:00'], delivery_by: 'Juan, mi hijo' },
    { ...baseShop, id: 's2', name: 'Panadería La Espiga', category: 'panaderia', street: 'General Lacy', hours: 'Abierta hasta las 20:30', free_reservations_used: 2, tipo: 'tienda', fachada: 'pan' },
    { ...baseShop, id: 's3', name: 'Bar La Parada', category: 'otra', street: 'General Lacy', hours: 'Cocina de 13:30 a 16:00', free_reservations_used: 1, tipo: 'restaurante', fachada: 'bar', delivery_enabled: true, delivery_fee_cents: 100, delivery_slots: ['14:00 a 15:30'], delivery_by: 'Ramón' },
  ];
  const offers: Offer[] = [
    { id: 'o1', shop_id: 's1', shop_name: 'Frutería Carmen', kind: 'rebaja', title: 'Manzanas reineta', unit: 'el kilo', price_cents: 168, old_price_cents: 240, qty_left: 8, until: at(240), created_at: at(-200), active: true },
    { id: 'o3', shop_id: 's2', shop_name: 'Panadería La Espiga', kind: 'novedad', title: 'Pan de masa madre, recién salido', unit: 'la hogaza', price_cents: 380, old_price_cents: null, qty_left: 10, until: at(120), created_at: at(-30), active: true },
  ];
  const menus: Menu[] = [
    { id: 'm1', shop_id: 's3', shop_name: 'Bar La Parada', day: madridISODate(), starters: 'Lentejas estofadas o ensalada mixta', mains: 'Merluza a la plancha o pollo asado', includes: 'Postre o café, pan y bebida',
      price_cents: 1000, qty_total: 20, qty_left: 2, until: at(180), allergens: ['Gluten', 'Pescado', 'Huevo', 'Apio', 'Leche'], takeaway: true, delivery: true, active: true, created_at: at(-120) },
  ];
  const res: Reservation[] = [];
  const mine: Reservation[] = [];
  const mres: MenuReservation[] = [];
  const muted = new Set<string>();
  const me: Me = { name: 'Toni', verified: true, verifiedBy: 'Frutería Carmen' };
  let selected = 's1';
  const wait = () => new Promise((r) => setTimeout(r, 120));
  const shopOf = () => shops.find((s) => s.id === selected)!;

  return {
    mode: 'demo',
    async me() { await wait(); return { ...me }; },
    async createProfile(name) { await wait(); me.name = name; },
    async signOut() { await wait(); },
    async shops() { await wait(); return shops.map((s) => ({ ...s })); },
    async liveOffers() { await wait(); return offers.filter((o) => isLive(o) && !muted.has(o.shop_id)).map((o) => ({ ...o })); },
    async liveMenus() { await wait(); return menus.filter((m) => m.active && m.qty_left > 0 && !muted.has(m.shop_id)).map((m) => ({ ...m })); },
    async muteShop(shopId) { await wait(); muted.add(shopId); },
    async reserve(offerId, qty, opts) {
      await wait();
      const o = offers.find((x) => x.id === offerId);
      if (!o || o.qty_left < qty) throw new Error('No quedan suficientes unidades');
      const s = shops.find((x) => x.id === o.shop_id)!;
      if (opts.mode === 'entrega' && !s.delivery_enabled) throw new Error('Esta tienda no hace entregas');
      o.qty_left -= qty;
      const r: Reservation = { id: 'r' + Date.now(), offer_id: o.id, shop_id: o.shop_id, offer_title: o.title, shop_name: o.shop_name, neighbour_name: me.name, qty, pickup_at: null, note: opts.note || null, status: 'nueva', created_at: new Date().toISOString(),
        mode: opts.mode, delivery_address: opts.mode === 'entrega' ? opts.address || null : null, delivery_slot: opts.slot || null, delivery_fee_cents: opts.mode === 'entrega' ? s.delivery_fee_cents : null };
      mine.unshift(r); res.unshift({ ...r });
    },
    async reserveMenu(menuId, qty, mode, atTime, address) {
      await wait();
      const m = menus.find((x) => x.id === menuId);
      if (!m || m.qty_left < qty) throw new Error('No quedan menús suficientes');
      m.qty_left -= qty;
      if (m.qty_left === 0) m.active = false;
      mres.unshift({ id: 'mr' + Date.now(), menu_id: m.id, shop_id: m.shop_id, shop_name: m.shop_name, neighbour_name: me.name, mode, at_time: atTime, qty, delivery_address: mode === 'entrega' ? address || null : null, note: null, status: 'nueva', created_at: new Date().toISOString() });
    },
    async myReservations() { await wait(); return mine.map((r) => ({ ...r, status: res.find((x) => x.id === r.id)?.status ?? r.status })); },
    async myMenuReservations() { await wait(); return mres.map((r) => ({ ...r })); },
    async cancel(id) { await wait(); [...mine, ...res].filter((r) => r.id === id).forEach((r) => { r.status = 'cancelada'; }); },
    async cancelMenu(id) { await wait(); const r = mres.find((x) => x.id === id); if (r) r.status = 'cancelada'; },
    async requestShopCode() { await wait(); return 'LACY-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0'); },
    async myShops() { await wait(); return shops.filter((s) => s.id === 's1' || s.id === 's3').map((s) => ({ ...s })); },
    selectShop(id) { selected = id; },
    async myShop() { await wait(); return { ...shopOf() }; },
    async updateShop(settings) { await wait(); Object.assign(shopOf(), settings); },
    async shopReservations() { await wait(); return res.filter((r) => r.shop_id === selected).map((r) => ({ ...r })); },
    async setStatus(id, status) {
      await wait();
      [...res, ...mine].filter((r) => r.id === id).forEach((r) => { r.status = status; if (['recogida', 'rechazada', 'cancelada', 'no_show'].includes(status)) r.delivery_address = null; });
      if (status === 'recogida') shopOf().free_reservations_used = Math.min(10, shopOf().free_reservations_used + 1);
    },
    async publishOffer(n: NewOffer) {
      await wait();
      const today = madridDay(new Date().toISOString());
      const mineAll = offers.filter((o) => o.shop_id === selected);
      if (mineAll.filter((o) => o.created_at && madridDay(o.created_at) === today).length >= MAX_OFERTAS_DIA) throw new Error('Hoy ya has publicado 2 ofertas. Mañana podrás publicar de nuevo.');
      if (mineAll.filter(isLive).length >= MAX_OFERTAS_ACTIVAS) throw new Error('Ya tienes 2 ofertas en la calle. Retira una o espera a que se agote para publicar otra.');
      const { prior_price_basis, ...rest } = n;
      void prior_price_basis;
      offers.unshift({ id: 'o' + Date.now(), shop_id: selected, shop_name: shopOf().name, created_at: new Date().toISOString(), active: true, ...rest });
    },
    async shopOffersToday() {
      await wait();
      const today = madridDay(new Date().toISOString());
      return offers.filter((o) => o.shop_id === selected && ((o.created_at && madridDay(o.created_at) === today) || isLive(o))).map((o) => ({ ...o }));
    },
    async withdrawOffer(id) { await wait(); const o = offers.find((x) => x.id === id); if (o) o.active = false; },
    async confirmNeighbour(code) {
      await wait();
      if (!/^LACY-\d{4}$/i.test(code.trim())) throw new Error('Código no válido');
      return 'Vecino';
    },
    async myMenuToday() { await wait(); return menus.find((m) => m.shop_id === selected && m.day === madridISODate()) ?? null; },
    async publishMenu(n) {
      await wait();
      if (shopOf().tipo !== 'restaurante') throw new Error('Solo los restaurantes publican menú del día');
      if (menus.some((m) => m.shop_id === selected && m.day === madridISODate())) throw new Error('Ya has publicado el menú de hoy');
      menus.unshift({ ...n, id: 'm' + Date.now(), shop_id: selected, shop_name: shopOf().name, day: madridISODate(), qty_left: n.qty_total, active: true, created_at: new Date().toISOString() });
    },
    async closeMenu(id) { await wait(); const m = menus.find((x) => x.id === id); if (m) m.active = false; },
    async shopMenuReservations() { await wait(); return mres.filter((r) => r.shop_id === selected).map((r) => ({ ...r })); },
    async setMenuStatus(id, status) { await wait(); const r = mres.find((x) => x.id === id); if (r) r.status = status; },
  };
}

// ------------------------------------------------------------------
// Supabase: las reglas (stock, estados, contador) viven en la base de datos.
// ------------------------------------------------------------------
const SHOP_COLS = 'id, name, category, street, hours, free_reservations_used, tipo, fachada, about, delivery_enabled, delivery_fee_cents, delivery_free_from_cents, delivery_radius_m, delivery_slots, delivery_by';
const OFFER_COLS = 'id, shop_id, kind, title, unit, price_cents, old_price_cents, qty_left, until, created_at, active';
const MENU_COLS = 'id, shop_id, day, starters, mains, includes, price_cents, qty_total, qty_left, until, allergens, takeaway, delivery, active, created_at';

function liveRepo(): Repo {
  const sb = supabase!;
  const ok = <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const RES_COLS = 'id, offer_id, shop_id, qty, pickup_at, note, status, created_at, mode, delivery_address, delivery_slot, delivery_fee_cents, offers(title), shops(name), profiles(display_name)';
  const mapRes = (r: any): Reservation => ({
    id: r.id, offer_id: r.offer_id, shop_id: r.shop_id, qty: r.qty, pickup_at: r.pickup_at, note: r.note, status: r.status, created_at: r.created_at,
    mode: r.mode ?? 'recogida', delivery_address: r.delivery_address ?? null, delivery_slot: r.delivery_slot ?? null, delivery_fee_cents: r.delivery_fee_cents ?? null,
    offer_title: r.offers?.title ?? '', shop_name: r.shops?.name, neighbour_name: r.profiles?.display_name ?? 'Vecino',
  });
  const MRES_COLS = 'id, menu_id, shop_id, mode, at_time, qty, delivery_address, note, status, created_at, shops(name), profiles(display_name)';
  const mapMRes = (r: any): MenuReservation => ({
    id: r.id, menu_id: r.menu_id, shop_id: r.shop_id, mode: r.mode, at_time: r.at_time, qty: r.qty, delivery_address: r.delivery_address, note: r.note, status: r.status, created_at: r.created_at,
    shop_name: r.shops?.name, neighbour_name: r.profiles?.display_name ?? 'Vecino',
  });
  const uid = async () => {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error('Sin sesión');
    return data.user.id;
  };
  const mutedSet = async () => new Set(((ok(await sb.from('muted_shops').select('shop_id').eq('neighbour_id', await uid())) as any[]) ?? []).map((m) => m.shop_id));
  let shopCache: Shop | null = null;
  let selected: string | null = null;

  const repo: Repo = {
    mode: 'live',
    async me() {
      const rows = ok(await sb.from('profiles').select('display_name, verified_at, shops:verified_by_shop(name)').eq('id', await uid()).limit(1));
      const p = (rows as any[])[0];
      if (!p) {
        // Si dio su nombre al crear la cuenta, el perfil se crea aquí, también tras confirmar el correo.
        const { data } = await sb.auth.getUser();
        const name = String(data.user?.user_metadata?.display_name ?? '').trim();
        if (!name) return null;
        await repo.createProfile(name);
        return { name, verified: false, verifiedBy: null };
      }
      return { name: p.display_name, verified: !!p.verified_at, verifiedBy: p.shops?.name ?? null };
    },
    async createProfile(name) {
      ok(await sb.from('profiles').upsert({ id: await uid(), display_name: name.trim(), street: 'General Lacy' }, { onConflict: 'id', ignoreDuplicates: true }));
    },
    async signOut() { shopCache = null; selected = null; await sb.auth.signOut(); },
    async shops() {
      return ok(await sb.from('shops').select(SHOP_COLS).eq('active', true).order('name')) as Shop[];
    },
    async liveOffers() {
      const [rows, muted] = await Promise.all([
        sb.from('offers').select(OFFER_COLS + ', shops(name)').eq('active', true).gt('qty_left', 0).gt('until', new Date().toISOString()).order('created_at', { ascending: false }).then(ok),
        mutedSet(),
      ]);
      return (rows as any[]).filter((o) => !muted.has(o.shop_id)).map((o) => ({ ...o, shop_name: o.shops?.name }));
    },
    async liveMenus() {
      const [rows, muted] = await Promise.all([
        sb.from('menus').select(MENU_COLS + ', shops(name)').eq('active', true).gt('until', new Date().toISOString()).order('created_at', { ascending: false }).then(ok),
        mutedSet(),
      ]);
      return (rows as any[]).filter((m) => !muted.has(m.shop_id)).map((m) => ({ ...m, shop_name: m.shops?.name }));
    },
    async muteShop(shopId) { ok(await sb.from('muted_shops').insert({ neighbour_id: await uid(), shop_id: shopId })); },
    async reserve(offerId, qty, opts) {
      // shop_id, precio de entrega y estado los rellena la base de datos
      ok(await sb.from('reservations').insert({
        offer_id: offerId, shop_id: '00000000-0000-0000-0000-000000000000', neighbour_id: await uid(), qty, note: opts.note || null,
        mode: opts.mode, delivery_address: opts.mode === 'entrega' ? (opts.address ?? '').trim() : null, delivery_slot: opts.mode === 'entrega' ? opts.slot ?? null : null,
      }));
    },
    async reserveMenu(menuId, qty, mode, atTime, address) {
      ok(await sb.from('menu_reservations').insert({
        menu_id: menuId, shop_id: '00000000-0000-0000-0000-000000000000', neighbour_id: await uid(), qty, mode, at_time: atTime,
        delivery_address: mode === 'entrega' ? (address ?? '').trim() : null,
      }));
    },
    async myReservations() {
      const rows = ok(await sb.from('reservations').select(RES_COLS).eq('neighbour_id', await uid()).order('created_at', { ascending: false }).limit(30));
      return (rows as any[]).map(mapRes);
    },
    async myMenuReservations() {
      const rows = ok(await sb.from('menu_reservations').select(MRES_COLS).eq('neighbour_id', await uid()).order('created_at', { ascending: false }).limit(20));
      return (rows as any[]).map(mapMRes);
    },
    async cancel(id) { ok(await sb.from('reservations').update({ status: 'cancelada' }).eq('id', id)); },
    async cancelMenu(id) { ok(await sb.from('menu_reservations').update({ status: 'cancelada' }).eq('id', id)); },
    async requestShopCode() { return ok(await sb.rpc('request_shop_code')) as string; },
    async myShops() {
      return ok(await sb.from('shops').select(SHOP_COLS).eq('owner_id', await uid()).order('created_at')) as Shop[];
    },
    selectShop(id) { selected = id; shopCache = null; },
    async myShop() {
      const list = await repo.myShops();
      shopCache = list.find((s) => s.id === selected) ?? list[0] ?? null;
      if (shopCache) selected = shopCache.id;
      return shopCache;
    },
    async updateShop(settings) {
      const shop = shopCache ?? (await repo.myShop());
      if (!shop) throw new Error('No tienes una tienda dada de alta');
      ok(await sb.from('shops').update(settings).eq('id', shop.id));
    },
    async shopReservations() {
      const shop = shopCache ?? (await repo.myShop());
      if (!shop) return [];
      const rows = ok(await sb.from('reservations').select(RES_COLS).eq('shop_id', shop.id).gte('created_at', startOfToday()).order('created_at', { ascending: false }));
      return (rows as any[]).map(mapRes);
    },
    async setStatus(id, status: ReservationStatus) { ok(await sb.from('reservations').update({ status }).eq('id', id)); },
    async publishOffer(n) {
      const shop = shopCache ?? (await repo.myShop());
      if (!shop) throw new Error('No tienes una tienda dada de alta');
      ok(await sb.from('offers').insert({ shop_id: shop.id, ...n }));
    },
    async confirmNeighbour(code) { return ok(await sb.rpc('confirm_neighbour', { p_code: code })) as string; },
    async shopOffersToday() {
      const shop = shopCache ?? (await repo.myShop());
      if (!shop) return [];
      const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      const rows = ok(await sb.from('offers').select(OFFER_COLS).eq('shop_id', shop.id).or(`created_at.gte.${since},and(active.eq.true,until.gt.${new Date().toISOString()})`).order('created_at', { ascending: false }));
      const today = madridDay(new Date().toISOString());
      return (rows as Offer[]).filter((o) => (o.created_at && madridDay(o.created_at) === today) || isLive(o));
    },
    async withdrawOffer(id) { ok(await sb.from('offers').update({ active: false }).eq('id', id)); },
    async myMenuToday() {
      const shop = shopCache ?? (await repo.myShop());
      if (!shop) return null;
      const rows = ok(await sb.from('menus').select(MENU_COLS).eq('shop_id', shop.id).eq('day', madridISODate()).limit(1));
      return ((rows as Menu[])[0]) ?? null;
    },
    async publishMenu(n) {
      const shop = shopCache ?? (await repo.myShop());
      if (!shop) throw new Error('No tienes un restaurante dado de alta');
      const r = await sb.from('menus').insert({ shop_id: shop.id, qty_left: n.qty_total, ...n });
      if (r.error?.message.includes('duplicate')) throw new Error('Ya has publicado el menú de hoy');
      ok(r);
    },
    async closeMenu(id) { ok(await sb.from('menus').update({ active: false }).eq('id', id)); },
    async shopMenuReservations() {
      const shop = shopCache ?? (await repo.myShop());
      if (!shop) return [];
      const rows = ok(await sb.from('menu_reservations').select(MRES_COLS).eq('shop_id', shop.id).gte('created_at', startOfToday()).order('at_time'));
      return (rows as any[]).map(mapMRes);
    },
    async setMenuStatus(id, status) { ok(await sb.from('menu_reservations').update({ status }).eq('id', id)); },
  };
  return repo;
}

export const repo: Repo = supabase ? liveRepo() : demoRepo();
