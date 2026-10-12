// Estilo realista (el elegido en el lienzo de diseño): fondo gris claro, tarjetas blancas
// y el verde de las tiendas de Madrid. El rojo solo para ofertas y emergencias; el azul para ayuda.
export const colors = {
  bg: '#F2F2F5',
  card: '#FFFFFF',
  ink: '#1F2328',
  muted: '#6B7178',
  faint: '#8A9099',
  line: '#ECEDEF',
  field: '#F6F7F8',
  green: '#2F6B4F',
  greenSoft: '#E7F1EB',
  red: '#D64545',
  redSoft: '#FBE9E4',
  blue: '#1D5FBF',
  blueSoft: '#E6EEFA',
  gold: '#B7791F',
  goldSoft: '#FBF1DE',
  wine: '#8E2F35',
  wineSoft: '#F7E6E7',
  segment: '#E4E5E9',
};

// Colores para las iniciales de las personas y las tiendas, siempre en el mismo orden.
export const people = ['#7A4A80', '#3E5C76', '#B7791F', '#3E7C8C', '#D64545', '#2F6B4F'];

export const radius = { sm: 12, md: 16, lg: 20, pill: 999 };

export const shadow = { boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.06)' } as const;

export const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

export const colorFor = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return people[h % people.length];
};
