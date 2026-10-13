import { supabase } from './supabase';
import { MAX_OFERTAS_ACTIVAS, MAX_OFERTAS_DIA } from './types';
import type { Appointment, BarrioEvent, CareAlert, ChatMessage, Conversation, Me, Menu, MenuReservation, NeighbourRequest, NewOffer, Notice, Offer, Person, Pro, Repo, Reservation, ReservationStatus, Review, Shop, Walk } from './types';

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
  const me: Me = { id: 'u1', name: 'Toni', verified: true, verifiedBy: 'Frutería Carmen', fase2: true };
  const notices: Notice[] = [
    { id: 'n1', kind: 'verificado', title: 'Ya eres vecino verificado', body: 'Te ha verificado Frutería Carmen.', created_at: at(-1440), read_at: at(-1400) },
    { id: 'n2', kind: 'reserva', title: 'Tu reserva va en camino', body: 'Frutería Carmen · Manzanas reineta', created_at: at(-20), read_at: null },
  ];
  const reqs: NeighbourRequest[] = [
    { id: 'q1', author_id: 'u4', author_name: 'Ana', kind: 'pido', category: 'compra', title: 'Necesito que alguien me suba la compra el jueves por la mañana.', details: 'Son dos bolsas, vivo en un cuarto sin ascensor.', when_text: 'Jueves', status: 'abierta', created_at: at(-60) },
    { id: 'q2', author_id: 'u5', author_name: 'Lucía', kind: 'pido', category: 'recado', title: 'Busco a alguien que me riegue las plantas del 4 al 10 de noviembre.', details: null, when_text: 'Noviembre', status: 'abierta', created_at: at(-180) },
    { id: 'q3', author_id: 'u2', author_name: 'Miguel', kind: 'ofrezco', category: 'prestamo', title: 'Presto un taladro este fin de semana.', details: null, when_text: 'Este finde', status: 'abierta', created_at: at(-1500) },
  ];
  const convs: Conversation[] = [
    { id: 'c1', request_id: 'q9', request_title: 'Paseo al perro el sábado', other_id: 'u6', other_name: 'Dani', i_started: false, status: 'pendiente', last_at: at(-15), last_text: 'Puedo ayudarte, lo saco a las 10.' },
  ];
  const msgs: Record<string, ChatMessage[]> = { c1: [{ id: 'mm1', sender_id: 'u6', body: 'Puedo ayudarte, lo saco a las 10.', created_at: at(-15) }] };
  const level = { favors_given: 4, hours_given: 4, hours_received: 2, level: 2, next_at: 6 };
  const days = (d: number, h: number, m = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const events: BarrioEvent[] = [
    { id: 'e1', creator_id: 'u2', shop_id: null, title: 'Partido nocturno de fútbol 7', category: 'deporte', starts_at: days(2, 21, 30), place: 'Pista del parque', capacity: 14, price_text: 'Gratis', description: 'Nivel de barrio, se juega para pasarlo bien. Trae ropa oscura y clara.', kids: false, active: true, going: 11, me_going: false },
    { id: 'e2', creator_id: 'u3', shop_id: 's1', shop_name: 'Frutería Carmen', title: 'Castañas en la puerta', category: 'barrio', starts_at: days(4, 11), place: 'Frutería Carmen', capacity: null, price_text: 'Gratis', description: 'Asamos las primeras castañas de la temporada.', kids: false, active: true, going: 23, me_going: false },
  ];
  let selected = 's1';
  const people: Person[] = [
    { link_id: 'l1', other_id: 'u5', name: 'Lucía', status: 'aceptada', i_sent: true, neighbour: true, i_share_vuelvo: true, i_share_cuidado: true, they_share_vuelvo: true, they_share_cuidado: true, awake: true, last_ok_at: null },
    { link_id: 'l2', other_id: 'u4', name: 'Ana', status: 'aceptada', i_sent: false, neighbour: true, i_share_vuelvo: false, i_share_cuidado: true, they_share_vuelvo: false, they_share_cuidado: true, awake: false, last_ok_at: at(-140) },
    { link_id: 'l3', other_id: 'u7', name: 'Marta', status: 'aceptada', i_sent: true, neighbour: false, i_share_vuelvo: true, i_share_cuidado: true, they_share_vuelvo: true, they_share_cuidado: false, awake: false, last_ok_at: null },
    { link_id: 'l4', other_id: 'u6', name: 'Dani', status: 'pendiente', i_sent: false, neighbour: true, i_share_vuelvo: false, i_share_cuidado: false, they_share_vuelvo: false, they_share_cuidado: false, awake: false, last_ok_at: null },
  ];
  const presence = { last_ok_at: null as string | null, awake_until: null as string | null };
  const alerts: CareAlert[] = [];
  const walks: Walk[] = [
    { id: 'w1', user_id: 'u5', user_name: 'Lucía', status: 'activa', eta_at: at(12), lat: 40.4003, lng: -3.6937, pos_at: at(-0.5), created_at: at(-8), ended_at: null },
  ];
  const pros: Pro[] = [
    { id: 'p1', user_id: 'u8', kind: 'fisio', title: 'Irene, fisioterapeuta', about: 'Fisioterapia a domicilio en el barrio. Espalda, rodilla y recuperación tras operaciones.', price_text: '40 € la sesión de 50 min', colegiado: 'Colegiada en Madrid', seguro_rc: true, reta: true, with_minors: false, cert_menores: false, status: 'verificada', reviews: 2, avg_stars: 5, done: 6 },
    { id: 'p2', user_id: 'u9', kind: 'clases', title: 'Laura, clases de inglés', about: 'Clases de inglés para niños de primaria y para adultos que empiezan.', price_text: '15 € la hora', colegiado: null, seguro_rc: false, reta: true, with_minors: true, cert_menores: true, status: 'verificada', reviews: 1, avg_stars: 4, done: 3 },
  ];
  const reviews: Record<string, Review[]> = {
    p1: [{ id: 'rv1', stars: 5, body: 'Me quitó el dolor de espalda en tres sesiones.', created_at: at(-4000), author_name: 'Ana' }, { id: 'rv2', stars: 5, body: null, created_at: at(-9000), author_name: 'Miguel' }],
    p2: [{ id: 'rv3', stars: 4, body: 'Mi hija va encantada.', created_at: at(-3000), author_name: 'Lucía' }],
  };
  const appts: Appointment[] = [];
  let myPro: Pro | null = null;
  const proAppts: Appointment[] = [];
  const wait = () => new Promise((r) => setTimeout(r, 120));
  const shopOf = () => shops.find((s) => s.id === selected)!;

  return {
    mode: 'demo',
    async me() { await wait(); return { ...me }; },
    async createProfile(name) { await wait(); me.name = name; },
    async signOut() { await wait(); },
    async requestDeletion() { await wait(); me.verified = false; },
    async exportMyData() { await wait(); return JSON.stringify({ perfil: me, reservas: mine, menus: mres }, null, 2); },
    async notices() { await wait(); return notices.map((n) => ({ ...n })); },
    async markNoticesRead() { await wait(); notices.forEach((n) => { n.read_at ??= new Date().toISOString(); }); },
    async events() { await wait(); return events.filter((e) => e.active).map((e) => ({ ...e })); },
    async createEvent(e) { await wait(); events.push({ ...e, id: 'e' + Date.now(), creator_id: me.id, active: true, going: 1, me_going: true }); },
    async joinEvent(id) { await wait(); const e = events.find((x) => x.id === id)!; if (e.capacity && e.going >= e.capacity) throw new Error('Ya no quedan plazas'); e.going += 1; e.me_going = true; },
    async leaveEvent(id) { await wait(); const e = events.find((x) => x.id === id)!; e.going -= 1; e.me_going = false; },
    async cancelEvent(id) { await wait(); const e = events.find((x) => x.id === id); if (e) e.active = false; },
    async requests() { await wait(); return reqs.filter((r) => r.status === 'abierta' || r.author_id === me.id).map((r) => ({ ...r })); },
    async createRequest(r) { await wait(); reqs.unshift({ ...r, id: 'q' + Date.now(), author_id: me.id, author_name: me.name, status: 'abierta', created_at: new Date().toISOString() }); },
    async offerHelp(requestId, message) {
      await wait();
      const r = reqs.find((x) => x.id === requestId)!;
      const c: Conversation = { id: 'c' + Date.now(), request_id: r.id, request_title: r.title, other_id: r.author_id, other_name: r.author_name, i_started: true, status: 'pendiente', last_at: new Date().toISOString(), last_text: message || 'Puedo ayudarte.' };
      convs.unshift(c); msgs[c.id] = [{ id: 'm' + Date.now(), sender_id: me.id, body: c.last_text!, created_at: c.last_at }];
      return c.id;
    },
    async closeRequest(id) { await wait(); const r = reqs.find((x) => x.id === id); if (r) r.status = 'resuelta'; level.favors_given += 0; },
    async conversations() { await wait(); return convs.map((c) => ({ ...c })); },
    async answerConversation(id, accept) { await wait(); const c = convs.find((x) => x.id === id); if (c) c.status = accept ? 'aceptada' : 'rechazada'; },
    async messages(id) { await wait(); return (msgs[id] ?? []).map((m) => ({ ...m })); },
    async sendMessage(id, body) { await wait(); (msgs[id] ??= []).push({ id: 'm' + Date.now(), sender_id: me.id, body, created_at: new Date().toISOString() }); const c = convs.find((x) => x.id === id); if (c) { c.last_text = body; c.last_at = new Date().toISOString(); } },
    async blockUser(userId) { await wait(); convs.filter((c) => c.other_id === userId).forEach((c) => { c.status = 'bloqueada'; }); },
    async report() { await wait(); },
    async myLevel() { await wait(); return { ...level }; },
    async people() { await wait(); return people.map((x) => ({ ...x })); },
    async myInviteCode() { await wait(); return 'LACY7K'; },
    async inviteByCode(code) { await wait(); if (!/^[A-Z2-9]{6}$/i.test(code.trim())) throw new Error('Ese código no existe. Revisa las letras.'); people.push({ link_id: 'l' + Date.now(), other_id: 'u' + Date.now(), name: 'Vecino nuevo', status: 'pendiente', i_sent: true, neighbour: true, i_share_vuelvo: false, i_share_cuidado: false, they_share_vuelvo: false, they_share_cuidado: false, awake: false, last_ok_at: null }); },
    async invitePerson() { await wait(); },
    async answerInvite(linkId, accept) { await wait(); const i = people.findIndex((x) => x.link_id === linkId); if (i < 0) return; if (accept) Object.assign(people[i], { status: 'aceptada', i_share_vuelvo: true, i_share_cuidado: true, they_share_vuelvo: true, they_share_cuidado: true }); else people.splice(i, 1); },
    async removePerson(userId) { await wait(); const i = people.findIndex((x) => x.other_id === userId); if (i >= 0) people.splice(i, 1); },
    async setPerm(userId, vuelvo, cuidado) { await wait(); const x = people.find((p) => p.other_id === userId); if (x) { x.i_share_vuelvo = vuelvo; x.i_share_cuidado = cuidado; } },
    async myPresence() { await wait(); return { ...presence }; },
    async imOk() { await wait(); presence.last_ok_at = new Date().toISOString(); },
    async setAwake(minutes) { await wait(); presence.awake_until = minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null; },
    async askHelp() { await wait(); if (!alerts.some((a) => a.user_id === me.id && a.status !== 'cerrada')) alerts.unshift({ id: 'a' + Date.now(), user_id: me.id, user_name: me.name, status: 'abierta', responder_name: null, created_at: new Date().toISOString(), my_answer: null }); },
    async careAlerts() { await wait(); return alerts.filter((a) => a.status !== 'cerrada').map((a) => ({ ...a })); },
    async respondHelp(id, going) { await wait(); const a = alerts.find((x) => x.id === id); if (a) { a.my_answer = going ? 'voy' : 'no_puedo'; if (going) { a.status = 'atendida'; a.responder_name = me.name; } } },
    async closeHelp(id) { await wait(); const a = alerts.find((x) => x.id === id); if (a) a.status = 'cerrada'; },
    async walks() { await wait(); return walks.filter((w) => w.status === 'activa').map((w) => ({ ...w })); },
    async startWalk(minutes) { await wait(); if (!walks.some((w) => w.user_id === me.id && w.status === 'activa')) walks.unshift({ id: 'w' + Date.now(), user_id: me.id, user_name: me.name, status: 'activa', eta_at: new Date(Date.now() + minutes * 60000).toISOString(), lat: null, lng: null, pos_at: null, created_at: new Date().toISOString(), ended_at: null }); },
    async updateWalk(lat, lng) { const w = walks.find((x) => x.user_id === me.id && x.status === 'activa'); if (w) { w.lat = lat; w.lng = lng; w.pos_at = new Date().toISOString(); } },
    async extendWalk(minutes) { await wait(); const w = walks.find((x) => x.user_id === me.id && x.status === 'activa'); if (w) w.eta_at = new Date(Math.max(Date.now(), new Date(w.eta_at).getTime()) + minutes * 60000).toISOString(); },
    async endWalk(arrived) { await wait(); const w = walks.find((x) => x.user_id === me.id && x.status === 'activa'); if (w) { w.status = arrived ? 'llegado' : 'cancelada'; w.lat = null; w.lng = null; } },
    async pros() { await wait(); return pros.filter((p) => p.status === 'verificada').map((p) => ({ ...p })); },
    async proReviews(id) { await wait(); return (reviews[id] ?? []).map((r) => ({ ...r })); },
    async requestAppointment(proId, whenText, note) { await wait(); const p = pros.find((x) => x.id === proId)!; appts.unshift({ id: 'ap' + Date.now(), pro_id: p.id, pro_title: p.title, client_id: me.id, client_name: me.name, when_text: whenText, note: note || null, status: 'pendiente', created_at: new Date().toISOString(), reviewed: false }); },
    async myAppointments() { await wait(); return appts.map((a) => ({ ...a })); },
    async myPro() { await wait(); return myPro ? { ...myPro } : null; },
    async applyPro(n) { await wait(); myPro = { ...n, id: 'pme', user_id: me.id, status: 'solicitada' }; },
    async updatePro(n) { await wait(); if (myPro) Object.assign(myPro, n); },
    async proAppointments() { await wait(); return proAppts.map((a) => ({ ...a })); },
    async setAppointment(id, status) { await wait(); [...appts, ...proAppts].filter((a) => a.id === id).forEach((a) => { a.status = status; }); },
    async review(a, stars, body) { await wait(); const x = appts.find((y) => y.id === a.id); if (x) x.reviewed = true; (reviews[a.pro_id] ??= []).unshift({ id: 'rv' + Date.now(), stars, body: body || null, created_at: new Date().toISOString(), author_name: me.name }); },
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
const PRO_COLS = 'id, user_id, kind, title, about, price_text, colegiado, seguro_rc, reta, with_minors, cert_menores, status';
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
      const id = await uid();
      const rows = ok(await sb.from('profiles').select('display_name, verified_at, fase2, shops:verified_by_shop(name)').eq('id', id).limit(1));
      const p = (rows as any[])[0];
      if (!p) {
        // Si dio su nombre al crear la cuenta, el perfil se crea aquí, también tras confirmar el correo.
        const { data } = await sb.auth.getUser();
        const name = String(data.user?.user_metadata?.display_name ?? '').trim();
        if (!name) return null;
        await repo.createProfile(name);
        return { id, name, verified: false, verifiedBy: null, fase2: false };
      }
      return { id, name: p.display_name, verified: !!p.verified_at, verifiedBy: p.shops?.name ?? null, fase2: !!p.fase2 };
    },
    async createProfile(name) {
      ok(await sb.from('profiles').upsert({ id: await uid(), display_name: name.trim(), street: 'General Lacy' }, { onConflict: 'id', ignoreDuplicates: true }));
    },
    async signOut() { shopCache = null; selected = null; await sb.auth.signOut(); },
    async requestDeletion() { ok(await sb.rpc('request_account_deletion')); },
    async exportMyData() {
      const id = await uid();
      const [perfil, reservas, menus, eventos, avisos] = await Promise.all([
        sb.from('profiles').select('display_name, street, verified_at, verify_method, created_at').eq('id', id).then(ok),
        sb.from('reservations').select('created_at, qty, status, mode, delivery_slot, offers(title), shops(name)').eq('neighbour_id', id).then(ok),
        sb.from('menu_reservations').select('created_at, qty, status, mode, at_time, shops(name)').eq('neighbour_id', id).then(ok),
        sb.from('event_attendees').select('created_at, events(title, starts_at)').eq('user_id', id).then(ok),
        sb.from('notifications').select('created_at, title, body').eq('user_id', id).then(ok),
      ]);
      return JSON.stringify({ exportado: new Date().toISOString(), perfil, reservas, menus, eventos, avisos }, null, 2);
    },
    async notices() {
      return ok(await sb.from('notifications').select('id, kind, title, body, created_at, read_at').eq('user_id', await uid()).order('created_at', { ascending: false }).limit(50)) as Notice[];
    },
    async markNoticesRead() { ok(await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', await uid()).is('read_at', null)); },
    async events() {
      const id = await uid();
      const rows = ok(await sb.from('events').select('id, creator_id, shop_id, title, category, starts_at, place, capacity, price_text, description, kids, active, shops(name)').eq('active', true).gt('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString()).order('starts_at')) as any[];
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const [counts, mineRows] = await Promise.all([
        sb.rpc('event_counts', { ids }).then(ok) as Promise<{ event_id: string; going: number }[]>,
        sb.from('event_attendees').select('event_id').eq('user_id', id).in('event_id', ids).then(ok) as Promise<{ event_id: string }[]>,
      ]);
      const mineSet = new Set(mineRows.map((m) => m.event_id));
      return rows.map((r) => ({ ...r, shop_name: r.shops?.name, going: counts.find((c) => c.event_id === r.id)?.going ?? 0, me_going: mineSet.has(r.id) }));
    },
    async createEvent(e) {
      const id = await uid();
      const created = ok(await sb.from('events').insert({ ...e, creator_id: id }).select('id').single()) as { id: string };
      ok(await sb.from('event_attendees').insert({ event_id: created.id, user_id: id }));
    },
    async joinEvent(eventId) { ok(await sb.from('event_attendees').insert({ event_id: eventId, user_id: await uid() })); },
    async leaveEvent(eventId) { ok(await sb.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', await uid())); },
    async cancelEvent(eventId) { ok(await sb.from('events').update({ active: false }).eq('id', eventId)); },
    async requests() {
      const rows = ok(await sb.from('requests').select('id, author_id, kind, category, title, details, when_text, status, created_at, profiles(display_name)').order('created_at', { ascending: false }).limit(60)) as any[];
      return rows.map((r) => ({ ...r, author_name: r.profiles?.display_name ?? 'Vecino' })) as NeighbourRequest[];
    },
    async createRequest(r) { ok(await sb.from('requests').insert({ ...r, author_id: await uid() })); },
    async offerHelp(requestId, message) { return ok(await sb.rpc('offer_help', { p_request: requestId, p_message: message })) as string; },
    async closeRequest(requestId, helperId, hours) { ok(await sb.rpc('resolve_request', { p_request: requestId, p_helper: helperId, p_hours: hours })); },
    async conversations() {
      const id = await uid();
      const rows = ok(await sb.from('conversations').select('id, request_id, starter_id, other_id, status, last_at, requests(title), starter:profiles!conversations_starter_id_fkey(display_name), other:profiles!conversations_other_id_fkey(display_name)').order('last_at', { ascending: false }).limit(50)) as any[];
      const ids = rows.map((r) => r.id);
      const last = ids.length ? (ok(await sb.from('messages').select('conversation_id, body, created_at').in('conversation_id', ids).order('created_at', { ascending: false }).limit(200)) as any[]) : [];
      return rows.map((r) => {
        const mine = r.starter_id === id;
        return { id: r.id, request_id: r.request_id, request_title: r.requests?.title ?? null, other_id: mine ? r.other_id : r.starter_id, other_name: (mine ? r.other?.display_name : r.starter?.display_name) ?? 'Vecino',
          i_started: mine, status: r.status, last_at: r.last_at, last_text: last.find((m) => m.conversation_id === r.id)?.body ?? null } as Conversation;
      });
    },
    async answerConversation(cid, accept) { ok(await sb.rpc('answer_conversation', { p_conversation: cid, p_accept: accept })); },
    async messages(cid) { return ok(await sb.from('messages').select('id, sender_id, body, created_at').eq('conversation_id', cid).order('created_at').limit(300)) as ChatMessage[]; },
    async sendMessage(cid, body) { ok(await sb.from('messages').insert({ conversation_id: cid, sender_id: await uid(), body: body.trim() })); },
    async blockUser(userId) { ok(await sb.rpc('block_user', { p_user: userId })); },
    async report(userId, reason, details, conversationId) { ok(await sb.from('reports').insert({ reporter_id: await uid(), reported_id: userId, reason, details: details.trim() || null, conversation_id: conversationId ?? null })); },
    async myLevel() {
      const rows = ok(await sb.rpc('my_level')) as any[];
      const r = rows?.[0] ?? { favors_given: 0, hours_given: 0, hours_received: 0, level: 1, next_at: 3 };
      return { favors_given: Number(r.favors_given), hours_given: Number(r.hours_given), hours_received: Number(r.hours_received), level: Number(r.level), next_at: Number(r.next_at) };
    },
    async people() { return ((ok(await sb.rpc('my_people')) as any[]) ?? []) as Person[]; },
    async myInviteCode() { return ok(await sb.rpc('my_invite_code')) as string; },
    async inviteByCode(code) { ok(await sb.rpc('invite_by_code', { p_code: code })); },
    async invitePerson(userId) { ok(await sb.rpc('invite_person', { p_user: userId })); },
    async answerInvite(linkId, accept) { ok(await sb.rpc('answer_trust', { p_link: linkId, p_accept: accept })); },
    async removePerson(userId) { ok(await sb.rpc('remove_trust', { p_user: userId })); },
    async setPerm(userId, vuelvo, cuidado) { ok(await sb.rpc('set_trust_perm', { p_user: userId, p_vuelvo: vuelvo, p_cuidado: cuidado })); },
    async myPresence() {
      const rows = ok(await sb.from('presence').select('last_ok_at, awake_until').eq('user_id', await uid()).limit(1)) as any[];
      return rows[0] ?? { last_ok_at: null, awake_until: null };
    },
    async imOk() { ok(await sb.rpc('i_am_ok')); },
    async setAwake(minutes) { ok(await sb.rpc('set_awake', { p_minutes: minutes })); },
    async askHelp() { ok(await sb.rpc('ask_help')); },
    async careAlerts() {
      const id = await uid();
      const rows = ok(await sb.from('care_alerts').select('id, user_id, status, created_at, user:profiles!care_alerts_user_id_fkey(display_name), responder:profiles!care_alerts_responder_id_fkey(display_name)').neq('status', 'cerrada').order('created_at', { ascending: false }).limit(20)) as any[];
      const ids = rows.map((r) => r.id);
      const mineAns = ids.length ? (ok(await sb.from('care_responses').select('alert_id, answer').eq('user_id', id).in('alert_id', ids)) as any[]) : [];
      return rows.map((r) => ({ id: r.id, user_id: r.user_id, user_name: r.user?.display_name ?? 'Tu vecino', status: r.status, responder_name: r.responder?.display_name ?? null, created_at: r.created_at, my_answer: mineAns.find((m) => m.alert_id === r.id)?.answer ?? null }));
    },
    async respondHelp(alertId, going) { ok(await sb.rpc('respond_help', { p_alert: alertId, p_going: going })); },
    async closeHelp(alertId) { ok(await sb.rpc('close_help', { p_alert: alertId })); },
    async walks() {
      const rows = ok(await sb.from('walks').select('id, user_id, status, eta_at, lat, lng, pos_at, created_at, ended_at, profiles!walks_user_id_fkey(display_name)').eq('status', 'activa').order('created_at', { ascending: false }).limit(20)) as any[];
      return rows.map((r) => ({ ...r, profiles: undefined, user_name: r.profiles?.display_name ?? 'Tu gente' })) as Walk[];
    },
    async startWalk(minutes) { ok(await sb.rpc('start_walk', { p_minutes: minutes })); },
    async updateWalk(lat, lng) { ok(await sb.rpc('update_walk', { p_lat: lat, p_lng: lng })); },
    async extendWalk(minutes) { ok(await sb.rpc('extend_walk', { p_minutes: minutes })); },
    async endWalk(arrived) { ok(await sb.rpc('end_walk', { p_arrived: arrived })); },
    async pros() {
      const [rows, sums] = await Promise.all([
        sb.from('pros').select(PRO_COLS).eq('status', 'verificada').order('created_at').then(ok) as Promise<any[]>,
        sb.rpc('pro_summary').then(ok) as Promise<any[]>,
      ]);
      return rows.map((p) => { const x = (sums ?? []).find((s: any) => s.pro_id === p.id); return { ...p, reviews: x?.reviews ?? 0, avg_stars: x?.avg_stars == null ? null : Number(x.avg_stars), done: x?.done ?? 0 }; }) as Pro[];
    },
    async proReviews(proId) {
      const rows = ok(await sb.from('pro_reviews').select('id, stars, body, created_at, profiles!pro_reviews_author_id_fkey(display_name)').eq('pro_id', proId).order('created_at', { ascending: false }).limit(30)) as any[];
      return rows.map((r) => ({ id: r.id, stars: r.stars, body: r.body, created_at: r.created_at, author_name: r.profiles?.display_name ?? 'Vecino' })) as Review[];
    },
    async requestAppointment(proId, whenText, note) { ok(await sb.from('pro_appointments').insert({ pro_id: proId, client_id: await uid(), when_text: whenText.trim(), note: note.trim() || null })); },
    async myAppointments() {
      const rows = ok(await sb.from('pro_appointments').select('id, pro_id, client_id, when_text, note, status, created_at, pros(title)').eq('client_id', await uid()).order('created_at', { ascending: false }).limit(30)) as any[];
      const ids = rows.map((r) => r.id);
      const revs = ids.length ? (ok(await sb.from('pro_reviews').select('appointment_id').in('appointment_id', ids)) as any[]) : [];
      return rows.map((r) => ({ ...r, pros: undefined, pro_title: r.pros?.title ?? 'Profesional', client_name: '', reviewed: revs.some((v) => v.appointment_id === r.id) })) as Appointment[];
    },
    async myPro() {
      const rows = ok(await sb.from('pros').select(PRO_COLS).eq('user_id', await uid()).limit(1)) as Pro[];
      return rows[0] ?? null;
    },
    async applyPro(n) { ok(await sb.from('pros').insert({ ...n, user_id: await uid() })); },
    async updatePro(n) { ok(await sb.from('pros').update(n).eq('user_id', await uid())); },
    async proAppointments() {
      const pro = await repo.myPro();
      if (!pro) return [];
      const rows = ok(await sb.from('pro_appointments').select('id, pro_id, client_id, when_text, note, status, created_at, profiles!pro_appointments_client_id_fkey(display_name)').eq('pro_id', pro.id).order('created_at', { ascending: false }).limit(50)) as any[];
      return rows.map((r) => ({ ...r, profiles: undefined, pro_title: pro.title, client_name: r.profiles?.display_name ?? 'Vecino', reviewed: false })) as Appointment[];
    },
    async setAppointment(id, status) { ok(await sb.rpc('set_appointment', { p_appt: id, p_status: status })); },
    async review(a, stars, body) { ok(await sb.from('pro_reviews').insert({ appointment_id: a.id, pro_id: a.pro_id, author_id: await uid(), stars, body: body.trim() || null })); },
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
