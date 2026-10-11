// Proyecto Supabase del piloto. La clave "anon" es pública por diseño (va dentro de la app);
// lo que protege los datos son las reglas de seguridad por filas de la base de datos.
// Nunca pongas aquí la clave "service_role".
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://gupdebihwahrvasqfflz.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1cGRlYmlod2FocnZhc3FmZmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NTI2MjAsImV4cCI6MjEwNzMyODYyMH0.HMoHSZ_dq360m2Oxfz3Hgd5GcJGgXhBfSSei76rMhbE';
// Pon EXPO_PUBLIC_DEMO=1 para enseñar la app con datos de ejemplo sin tocar la base de datos.
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';
