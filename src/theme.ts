// Paleta pastel del piloto de comercio (igual que en el lienzo de diseño).
export const colors = {
  bg: '#FFF6EC',
  card: '#FFFFFF',
  ink: '#1E1A3A',
  muted: '#5A5378',
  line: '#EFE7DB',
  yellow: '#FFC857',
  mint: '#7ED6A5',
  mintSoft: '#D9F3E4',
  peach: '#FFB38A',
  peachSoft: '#FFE3CF',
  lilac: '#C9A7FF',
  lilacSoft: '#E9DDFF',
  pink: '#FF8FA3',
  cream: '#FFF1C9',
  night: '#2A2148',
};

export const radius = { sm: 12, md: 18, pill: 999 };

export const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
