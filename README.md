# Stoop

El barrio te cuida.

App de barrio. Piloto de comercio en General Lacy y alrededores (Arganzuela, Madrid): las tiendas publican ofertas, los vecinos reservan y pagan en la tienda al recoger. No hay pagos dentro de la app.

## Qué hay ahora (fase 1)

- **Mi calle (vecino):** la calle dibujada, tus reservas, y «Hoy en tu calle»: una tarjeta por tienda con su menú y sus ofertas, por orden de hora, que termina en «Ya estás al día». Código para verificarte en una tienda.
- **Tiendas (vecino):** comercio de tu calle con su fachada, filtros (tiendas, restaurantes, a domicilio) y ficha con horario, menú del día, ofertas, cómo te lo dan y quién está detrás.
- **Reservar:** recoger en tienda o que te lo traiga alguien de la tienda (franja, precio de entrega y dirección que solo ve la tienda y se borra al entregar). En restaurantes: comer allí, para llevar o a casa, con hora y alérgenos antes de reservar.
- **Mi tienda / Mi bar (tendero):** reservas de hoy (aceptar, sin stock, entregado, no vino) con modo y dirección de entrega, menú del día con sus reservas, contador de 10 reservas gratis, confirmar vecinos y cambiar de tienda si tienes varias. **Ajustes:** horario, presentación y reglas de entrega.
- **Publicar (tendero):** oferta de tipo rebaja, lote o novedad. Los restaurantes publican además su menú del día (alérgenos obligatorios, raciones que se cierran solas; no cuenta como oferta).
- **Entrada** con correo y contraseña. Volveremos al código por correo cuando haya servidor de correo propio (SMTP). Si la cuenta se confirma por correo, la app pide el nombre la primera vez que entras.
- **Diseño realista** (el elegido en el lienzo): fondo gris claro, tarjetas blancas, verde de tienda. Las pestañas de tienda solo aparecen a quien tiene una tienda dada de alta.

Con `EXPO_PUBLIC_DEMO=1` la app arranca en **modo demostración** con una frutería de ejemplo, para enseñarla en la calle sin tocar datos reales.

## Reglas que garantiza la base de datos

Están en `supabase/migrations/0001_piloto_comercio.sql` y se comprueban en la base de datos, no en la app:

- Nadie puede crear ni activar una tienda desde la app; se dan de alta en persona (`supabase/alta_tienda.sql`).
- Nadie puede verificarse a sí mismo. Solo una tienda activa confirma a un vecino con su código.
- Solo los vecinos verificados ven ofertas y reservan.
- El stock se descuenta al reservar y se devuelve si se cancela o no hay.
- La tienda solo puede seguir el orden nueva → lista → recogida (o sin stock / no vino); el vecino solo puede cancelar.
- El contador de reservas gratis solo sube con reservas recogidas y el tendero no puede tocarlo.
- Cada tienda publica como máximo 2 ofertas al día y tiene como máximo 2 activas. Las ofertas no se borran, se retiran (así no se puede saltar el límite).
- Nunca se fijan ni limitan precios: cada tienda decide el suyo. La calle no ordena por precio ni compara tiendas, y cada tienda ocupa una sola tarjeta.
- Tres tipos de oferta: rebaja (precio de antes y de ahora; el tendero confirma que el de antes es el mínimo de 30 días o que el producto está a punto de caducar), lote y novedad (precio cerrado, sin tachar). Siempre se ve el precio final.
- El vecino puede silenciar una tienda.
- Cada uno ve solo sus reservas; la tienda solo las suyas y el nombre de quien reserva. La dirección de entrega solo existe mientras dura el pedido: se borra al entregar, cancelar o rechazar.
- Entregas: solo si la tienda las ha activado; el precio lo calcula la base de datos con las reglas de la tienda (gratis a partir de un importe).
- Menú del día (`0007`): solo restaurantes, uno al día, alérgenos obligatorios, raciones que se descuentan y se cierran solas. El tipo de comercio y la fachada los ponemos nosotros en el alta.

## Puesta en marcha

1. `npm install`
2. La conexión a Supabase ya está en `src/config.ts`.
3. Las migraciones `0001` a `0012` de `supabase/migrations/` ya están aplicadas en el proyecto Closer2you (13/10/2026). Solo hay que ejecutarlas a mano, en orden y una vez, si se crea un proyecto nuevo.
4. Para pruebas: Supabase > Authentication > Sign In / Providers > Email, desactiva "Confirm email".
5. Android: `npx eas-cli@latest build -p android --profile preview` genera un APK que se instala directamente, sin Google Play.

## Pendiente

- Verificación por factura y por DNI (el DNI, solo tras revisión legal y sin guardar la foto).
- Elección de cuota a partir de la reserva 11.
- Avisos push al tendero con la app cerrada, y al vecino como máximo 1 aviso al día por tienda.
- Fotos reales de fachada en la ficha de cada tienda (las hace Stoop en el alta). Hoy se usa la ilustración según el tipo.
- Distancia real a cada tienda y radio de entrega comprobado (hoy el radio es informativo).
- Avisos push: necesitan una versión propia de la app (development build), no funcionan en Expo Go.
- Fase 2: vecinos, Vuelvo a casa, cuidado y profesionales verificados (con revisión de seguridad antes de abrirla a vecinos reales).
- `npm run lint` y `npx tsc --noEmit` deben pasar antes de cada versión.
