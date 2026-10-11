export type ReservationStatus = 'nueva' | 'lista' | 'recogida' | 'rechazada' | 'cancelada' | 'no_show';

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
};

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
  // vecino
  liveOffers(): Promise<Offer[]>;
  reserve(offerId: string, qty: number, note?: string): Promise<void>;
  myReservations(): Promise<Reservation[]>;
  cancel(reservationId: string): Promise<void>;
  requestShopCode(): Promise<string>;
  // tienda
  myShop(): Promise<Shop | null>;
  shopReservations(): Promise<Reservation[]>;
  setStatus(reservationId: string, status: ReservationStatus): Promise<void>;
  publishOffer(offer: NewOffer): Promise<void>;
  confirmNeighbour(code: string): Promise<string>;
}
