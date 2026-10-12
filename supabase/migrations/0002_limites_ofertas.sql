-- Stoop: límites de ofertas para evitar el spam en la calle.
-- No se toca el precio: cada tienda decide el suyo (normativa de competencia).
--   * Máximo 2 publicaciones al día por tienda (día de Madrid).
--   * Máximo 2 ofertas activas a la vez.
--   * El vecino puede silenciar una tienda.

create or replace function public.tg_offer_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare hoy int; activas int;
begin
  select count(*) into hoy from offers
   where shop_id = new.shop_id
     and (created_at at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date;
  if hoy >= 2 then
    raise exception 'Hoy ya has publicado 2 ofertas. Mañana podrás publicar de nuevo.';
  end if;

  select count(*) into activas from offers
   where shop_id = new.shop_id and active and until > now() and qty_left > 0;
  if activas >= 2 then
    raise exception 'Ya tienes 2 ofertas en la calle. Retira una o espera a que se agote para publicar otra.';
  end if;
  return new;
end $$;

drop trigger if exists offer_limits on public.offers;
create trigger offer_limits before insert on public.offers
  for each row execute function public.tg_offer_limits();

-- Una oferta solo se puede retirar o ajustar, no reactivar ni cambiar de tienda.
create or replace function public.tg_offer_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.shop_id <> old.shop_id then raise exception 'No se puede mover una oferta de tienda'; end if;
    if new.active and not old.active then raise exception 'Una oferta retirada no se puede reactivar; publica una nueva'; end if;
    if new.created_at <> old.created_at then new.created_at := old.created_at; end if;
  end if;
  return new;
end $$;

drop trigger if exists offer_update on public.offers;
create trigger offer_update before update on public.offers
  for each row execute function public.tg_offer_update();

-- Las ofertas no se borran (borrar permitiría saltarse el límite diario): se retiran.
drop policy if exists offers_owner_all on public.offers;
create policy offers_owner_select on public.offers for select using (owns_shop(shop_id));
create policy offers_owner_insert on public.offers for insert with check (owns_shop(shop_id));
create policy offers_owner_update on public.offers for update using (owns_shop(shop_id)) with check (owns_shop(shop_id));

-- Tiendas silenciadas por cada vecino
create table if not exists public.muted_shops (
  neighbour_id uuid not null references public.profiles (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (neighbour_id, shop_id)
);
alter table public.muted_shops enable row level security;
create policy muted_self_all on public.muted_shops for all
  using (neighbour_id = auth.uid()) with check (neighbour_id = auth.uid());
