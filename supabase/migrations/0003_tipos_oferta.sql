-- Stoop: tres tipos de oferta para que las tiendas no compitan solo por precio.
--   rebaja:  precio rebajado + precio anterior. El tendero confirma que el precio anterior es el más
--            bajo de los últimos 30 días, o que el producto está cerca de caducar (normativa de rebajas).
--   lote:    caja o lote con su precio; no se tacha nada.
--   novedad: lo que ha llegado hoy, con su precio; no se tacha nada.
-- Siempre se muestra el precio final.

alter table public.offers
  add column if not exists kind text not null default 'rebaja'
    check (kind in ('rebaja', 'lote', 'novedad')),
  add column if not exists prior_price_basis text
    check (prior_price_basis in ('minimo_30_dias', 'proximo_a_caducar'));

-- Las ofertas existentes con precio anterior se consideran rebajas confirmadas.
update public.offers set prior_price_basis = 'minimo_30_dias'
 where kind = 'rebaja' and old_price_cents is not null and prior_price_basis is null;
update public.offers set kind = 'novedad' where kind = 'rebaja' and old_price_cents is null;

alter table public.offers drop constraint if exists offers_kind_prices;
alter table public.offers add constraint offers_kind_prices check (
  (kind = 'rebaja' and old_price_cents is not null and old_price_cents > price_cents and prior_price_basis is not null)
  or (kind in ('lote', 'novedad') and old_price_cents is null and prior_price_basis is null)
);
