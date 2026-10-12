export type OfferKind = 'rebaja' | 'lote' | 'novedad';
export type PriorPriceBasis = 'minimo_30_dias' | 'proximo_a_caducar';

export type ReservationStatus = 'nueva' | 'lista' | 'recogida' | 'rechazada' | 'cancelada' | 'no_show';

export type Me = {
  name: string;
  verified: boolean;
  verifiedBy: string | null; // nombre de la tienda que te verificó
};

export type Shop = {
  id: string;
  name: string;
  category: string;
  street: string;
  hours: string | null;
  free_reservations_used: number;
};

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

// Todo lo que la app necesita de los datos. Hay dos implementaciones:
// una de demostración en memoria y otra contra Supabase.
export interface Repo {
  mode: 'demo' | 'live';
  // perfil: null si aún no ha dicho cómo se llama
  me(): Promise<Me | null>;
  createProfile(name: string): Promise<void>;
  // vecino
  liveOffers(): Promise<Offer[]>;
  reserve(offerId: string, qty: number, note?: string): Promise<void>;
  myReservations(): Promise<Reservation[]>;
  cancel(reservationId: string): Promise<void>;
  requestShopCode(): Promise<string>;
  muteShop(shopId: string): Promise<void>;
  // tienda
  myShop(): Promise<Shop | null>;
  shopReservations(): Promise<Reservation[]>;
  setStatus(reservationId: string, status: ReservationStatus): Promise<void>;
  publishOffer(offer: NewOffer): Promise<void>;
  shopOffersToday(): Promise<Offer[]>; // publicadas hoy (activas o no) + activas de otros días
  withdrawOffer(offerId: string): Promise<void>;
  confirmNeighbour(code: string): Promise<string>;
  signOut(): Promise<void>;
}
