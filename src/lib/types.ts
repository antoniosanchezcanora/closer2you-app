export type OfferKind = 'rebaja' | 'lote' | 'novedad';
export type PriorPriceBasis = 'minimo_30_dias' | 'proximo_a_caducar';

export type ReservationStatus = 'nueva' | 'lista' | 'recogida' | 'rechazada' | 'cancelada' | 'no_show';

export type Me = {
  id: string;
  name: string;
  verified: boolean;
  verifiedBy: string | null; // nombre de la tienda que te verificó
  fase2: boolean; // acceso de prueba a la Fase 2 (lo activamos nosotros)
  barrio: string;
};

export type Notice = {
  id: string;
  kind: 'reserva' | 'tienda' | 'verificado' | 'evento' | 'sistema';
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

export type EventCategory = 'deporte' | 'cultura' | 'ninos' | 'mayores' | 'barrio';
export type BarrioEvent = {
  id: string;
  creator_id: string;
  shop_id: string | null;
  shop_name?: string;
  title: string;
  category: EventCategory;
  starts_at: string;
  place: string;
  capacity: number | null;
  price_text: string;
  description: string | null;
  kids: boolean;
  active: boolean;
  going: number;
  me_going: boolean;
};
export type NewEvent = Pick<BarrioEvent, 'title' | 'category' | 'starts_at' | 'place' | 'capacity' | 'price_text' | 'description' | 'kids' | 'shop_id'> & { kids_certified: boolean };

export type Fachada = 'fruta' | 'pan' | 'libros' | 'bar' | 'otra';

export type Shop = {
  id: string;
  name: string;
  category: string;
  street: string;
  hours: string | null;
  free_reservations_used: number;
  tipo: 'tienda' | 'restaurante';
  fachada: Fachada;
  about: string | null;
  delivery_enabled: boolean;
  delivery_fee_cents: number;
  delivery_free_from_cents: number | null;
  delivery_radius_m: number;
  delivery_slots: string[];
  delivery_by: string | null;
  barrio: string;
  photo_url: string | null; // foto de la fachada subida por la tienda
  use_photo: boolean; // true: se ve la foto; false: el dibujo de Stoop
};

// Lo que la tienda puede cambiar de su ficha y de su entrega.
export type ShopSettings = Pick<Shop, 'hours' | 'about' | 'use_photo' | 'delivery_enabled' | 'delivery_fee_cents' | 'delivery_free_from_cents' | 'delivery_radius_m' | 'delivery_slots' | 'delivery_by'>;

export type Offer = {
  id: string;
  shop_id: string;
  shop_name?: string;
  title: string;
  unit: string;
  price_cents: number;
  old_price_cents: number | null;
  qty_left: number;
  until: string;
  created_at?: string;
  active?: boolean;
  kind?: OfferKind;
};

// Límites de publicación por tienda (los garantiza la base de datos).
export const MAX_OFERTAS_DIA = 2;
export const MAX_OFERTAS_ACTIVAS = 2;

export type DeliveryMode = 'recogida' | 'entrega';

export type Reservation = {
  id: string;
  offer_id: string;
  shop_id: string;
  offer_title: string;
  shop_name?: string;
  neighbour_name: string;
  qty: number;
  pickup_at: string | null;
  note: string | null;
  status: ReservationStatus;
  created_at: string;
  mode: DeliveryMode;
  delivery_address: string | null;
  delivery_slot: string | null;
  delivery_fee_cents: number | null;
};

export type NewOffer = {
  kind: OfferKind;
  prior_price_basis: PriorPriceBasis | null; // solo rebajas
  title: string;
  unit: string;
  price_cents: number;
  old_price_cents: number | null;
  qty_left: number;
  until: string;
};

export type ReserveOptions = {
  mode: DeliveryMode;
  address?: string;
  slot?: string;
  note?: string;
};

// ------------------------------------------------------------------
// Menú del día (solo restaurantes). No cuenta como oferta.
// ------------------------------------------------------------------
export const ALERGENOS = ['Gluten', 'Crustáceos', 'Huevo', 'Pescado', 'Cacahuete', 'Soja', 'Leche', 'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Altramuces', 'Moluscos'] as const;

export type Menu = {
  id: string;
  shop_id: string;
  shop_name?: string;
  day: string;
  starters: string;
  mains: string;
  includes: string | null;
  price_cents: number;
  qty_total: number;
  qty_left: number;
  until: string;
  allergens: string[];
  takeaway: boolean;
  delivery: boolean;
  active: boolean;
  created_at: string;
};

export type NewMenu = Pick<Menu, 'starters' | 'mains' | 'includes' | 'price_cents' | 'qty_total' | 'until' | 'allergens' | 'takeaway' | 'delivery'>;

export type MenuMode = 'aqui' | 'llevar' | 'entrega';

export type MenuReservation = {
  id: string;
  menu_id: string;
  shop_id: string;
  shop_name?: string;
  neighbour_name: string;
  mode: MenuMode;
  at_time: string;
  qty: number;
  delivery_address: string | null;
  note: string | null;
  status: ReservationStatus;
  created_at: string;
};

// ------------------------------------------------------------------
// Fase 2: vecinos (solo cuentas con fase2)
// ------------------------------------------------------------------
export type RequestKind = 'pido' | 'ofrezco';
export type RequestCategory = 'compra' | 'recado' | 'prestamo' | 'compania' | 'otro';
export type NeighbourRequest = {
  id: string;
  author_id: string;
  author_name: string;
  kind: RequestKind;
  category: RequestCategory;
  title: string;
  details: string | null;
  when_text: string | null;
  status: 'abierta' | 'resuelta' | 'cerrada';
  created_at: string;
};
export type NewRequest = Pick<NeighbourRequest, 'kind' | 'category' | 'title' | 'details' | 'when_text'>;
export type Conversation = {
  id: string;
  request_id: string | null;
  request_title: string | null;
  other_id: string;
  other_name: string;
  i_started: boolean;
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'bloqueada';
  last_at: string;
  last_text: string | null;
};
export type ChatMessage = { id: string; sender_id: string; body: string; created_at: string };
export type Level = { favors_given: number; hours_given: number; hours_received: number; level: number; next_at: number };
export type ReportReason = 'acoso' | 'estafa' | 'cobro' | 'inapropiado' | 'otro';

// Mi gente y Cuidarnos
export type Person = {
  link_id: string;
  other_id: string;
  name: string;
  status: 'pendiente' | 'aceptada';
  i_sent: boolean;
  neighbour: boolean; // verificado por una tienda (si no, amigo de otro barrio)
  i_share_vuelvo: boolean;
  i_share_cuidado: boolean;
  they_share_vuelvo: boolean;
  they_share_cuidado: boolean;
  awake: boolean;
  last_ok_at: string | null;
};
export type CareAlert = { id: string; user_id: string; user_name: string; status: 'abierta' | 'atendida' | 'cerrada'; responder_name: string | null; created_at: string; my_answer: 'voy' | 'no_puedo' | null };
export type Walk = { id: string; user_id: string; user_name: string; status: 'activa' | 'llegado' | 'cancelada'; eta_at: string; lat: number | null; lng: number | null; pos_at: string | null; created_at: string; ended_at: string | null };
export type MyPresence = { last_ok_at: string | null; awake_until: string | null };

// Profesionales (Fase 2)
export type ProKind = 'fisio' | 'clases' | 'cuidados' | 'reparaciones' | 'otro';
export type Pro = {
  id: string;
  user_id: string;
  kind: ProKind;
  title: string;
  about: string | null;
  price_text: string | null;
  colegiado: string | null;
  seguro_rc: boolean;
  reta: boolean;
  with_minors: boolean;
  cert_menores: boolean;
  status: 'solicitada' | 'verificada' | 'rechazada' | 'pausada';
  reviews?: number;
  avg_stars?: number | null;
  done?: number;
};
export type NewPro = Pick<Pro, 'kind' | 'title' | 'about' | 'price_text' | 'colegiado' | 'seguro_rc' | 'reta' | 'with_minors' | 'cert_menores'>;
export type Appointment = {
  id: string;
  pro_id: string;
  pro_title: string;
  client_id: string;
  client_name: string;
  when_text: string;
  note: string | null;
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'hecha' | 'cancelada';
  created_at: string;
  reviewed: boolean;
};
export type ShopRequest = { name: string; tipo: 'tienda' | 'restaurante'; category: 'fruteria' | 'panaderia' | 'peluqueria' | 'carniceria' | 'pescaderia' | 'otra'; street: string; nif: string; independent: boolean; phone: string | null };
export type ShopRequestStatus = ShopRequest & { id: string; status: 'pendiente' | 'aprobada' | 'rechazada'; created_at: string };
export type Review = { id: string; stars: number; body: string | null; created_at: string; author_name: string };

// Todo lo que la app necesita de los datos. Hay dos implementaciones:
// una de demostración en memoria y otra contra Supabase.
export interface Repo {
  mode: 'demo' | 'live';
  // perfil: null si aún no ha dicho cómo se llama
  me(): Promise<Me | null>;
  createProfile(name: string): Promise<void>;
  signOut(): Promise<void>;
  requestDeletion(): Promise<void>;
  exportMyData(): Promise<string>;
  // avisos
  notices(): Promise<Notice[]>;
  markNoticesRead(): Promise<void>;
  // agenda
  events(): Promise<BarrioEvent[]>;
  createEvent(e: NewEvent): Promise<void>;
  joinEvent(id: string): Promise<void>;
  leaveEvent(id: string): Promise<void>;
  cancelEvent(id: string): Promise<void>;
  // vecinos (Fase 2)
  requests(): Promise<NeighbourRequest[]>;
  createRequest(r: NewRequest): Promise<void>;
  offerHelp(requestId: string, message: string): Promise<string>;
  closeRequest(requestId: string, helperId: string | null, hours: number): Promise<void>;
  conversations(): Promise<Conversation[]>;
  answerConversation(id: string, accept: boolean): Promise<void>;
  messages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(conversationId: string, body: string): Promise<void>;
  blockUser(userId: string): Promise<void>;
  report(userId: string, reason: ReportReason, details: string, conversationId?: string): Promise<void>;
  myLevel(): Promise<Level>;
  // Mi gente
  people(): Promise<Person[]>;
  myInviteCode(): Promise<string>;
  inviteByCode(code: string): Promise<void>;
  invitePerson(userId: string): Promise<void>;
  answerInvite(linkId: string, accept: boolean): Promise<void>;
  removePerson(userId: string): Promise<void>;
  setPerm(userId: string, vuelvo: boolean, cuidado: boolean): Promise<void>;
  // Cuidarnos
  myPresence(): Promise<MyPresence>;
  imOk(): Promise<void>;
  setAwake(minutes: number): Promise<void>;
  askHelp(): Promise<void>;
  careAlerts(): Promise<CareAlert[]>; // las mías abiertas y las de mi gente
  respondHelp(alertId: string, going: boolean): Promise<void>;
  closeHelp(alertId: string): Promise<void>;
  walks(): Promise<Walk[]>; // la mía activa y las de mi gente
  startWalk(minutes: number): Promise<void>;
  updateWalk(lat: number, lng: number): Promise<void>;
  extendWalk(minutes: number): Promise<void>;
  endWalk(arrived: boolean): Promise<void>;
  // Profesionales
  pros(): Promise<Pro[]>;
  proReviews(proId: string): Promise<Review[]>;
  requestAppointment(proId: string, whenText: string, note: string): Promise<void>;
  myAppointments(): Promise<Appointment[]>; // como cliente
  myPro(): Promise<Pro | null>;
  applyPro(p: NewPro): Promise<void>;
  updatePro(p: Partial<NewPro> & { status?: 'verificada' | 'pausada' }): Promise<void>;
  proAppointments(): Promise<Appointment[]>; // como profesional
  setAppointment(id: string, status: 'aceptada' | 'rechazada' | 'hecha' | 'cancelada'): Promise<void>;
  review(appointment: Appointment, stars: number, body: string): Promise<void>;
  // Mi barrio: las tiendas que sigo
  follows(): Promise<string[]>;
  follow(shopId: string): Promise<void>;
  unfollow(shopId: string): Promise<void>;
  followerCounts(): Promise<Record<string, number>>;
  // Alta de tiendas
  claimShop(code: string): Promise<string>;
  requestShop(r: ShopRequest): Promise<void>;
  myShopRequest(): Promise<ShopRequestStatus | null>;
  // vecino
  shops(): Promise<Shop[]>;
  liveOffers(): Promise<Offer[]>;
  liveMenus(): Promise<Menu[]>;
  reserve(offerId: string, qty: number, opts: ReserveOptions): Promise<void>;
  reserveMenu(menuId: string, qty: number, mode: MenuMode, atTime: string, address?: string): Promise<void>;
  myReservations(): Promise<Reservation[]>;
  myMenuReservations(): Promise<MenuReservation[]>;
  cancel(reservationId: string): Promise<void>;
  cancelMenu(reservationId: string): Promise<void>;
  requestShopCode(): Promise<string>;
  muteShop(shopId: string): Promise<void>;
  // tienda (una cuenta puede tener varias: se trabaja con la elegida)
  myShops(): Promise<Shop[]>;
  selectShop(shopId: string): void;
  myShop(): Promise<Shop | null>;
  updateShop(settings: Partial<ShopSettings>): Promise<void>;
  uploadShopPhoto(localUri: string): Promise<string>; // la reduce, la sube y la deja puesta
  shopReservations(): Promise<Reservation[]>;
  setStatus(reservationId: string, status: ReservationStatus): Promise<void>;
  publishOffer(offer: NewOffer): Promise<void>;
  shopOffersToday(): Promise<Offer[]>; // publicadas hoy (activas o no) + activas de otros días
  withdrawOffer(offerId: string): Promise<void>;
  confirmNeighbour(code: string): Promise<string>;
  // restaurante
  myMenuToday(): Promise<Menu | null>;
  publishMenu(menu: NewMenu): Promise<void>;
  closeMenu(menuId: string): Promise<void>;
  shopMenuReservations(): Promise<MenuReservation[]>;
  setMenuStatus(reservationId: string, status: ReservationStatus): Promise<void>;
}
