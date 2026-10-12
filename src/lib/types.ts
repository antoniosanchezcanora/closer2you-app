export type OfferKind = 'rebaja' | 'lote' | 'novedad';
export type PriorPriceBasis = 'minimo_30_dias' | 'proximo_a_caducar';

export type ReservationStatus = 'nueva' | 'lista' | 'recogida' | 'rechazada' | 'cancelada' | 'no_show';

export type Me = {
  name: string;
  verified: boolean;
  verifiedBy: string | null; // nombre de la tienda que te verificó
};

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
};

// Lo que la tienda puede cambiar de su ficha y de su entrega.
export type ShopSettings = Pick<Shop, 'hours' | 'about' | 'delivery_enabled' | 'delivery_fee_cents' | 'delivery_free_from_cents' | 'delivery_radius_m' | 'delivery_slots' | 'delivery_by'>;

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

// Todo lo que la app necesita de los datos. Hay dos implementaciones:
// una de demostración en memoria y otra contra Supabase.
export interface Repo {
  mode: 'demo' | 'live';
  // perfil: null si aún no ha dicho cómo se llama
  me(): Promise<Me | null>;
  createProfile(name: string): Promise<void>;
  signOut(): Promise<void>;
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
