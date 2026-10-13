-- Cada vecino hace su barrio: sigue las tiendas que le gustan y recibe sus avisos primero.
-- La plaza enseña todo lo publicado en el barrio, para quien no sigue a esa tienda.
-- Mi ciudad: las tiendas que sigues fuera de tu barrio.
-- Alta de tiendas: reclamar con el código que deja Stoop en la visita, o pedir el alta (queda pendiente de visita).

alter table public.shops add column if not exists barrio text not null default 'Palos de la Frontera';
alter table public.profiles add column if not exists barrio text not null default 'Palos de la Frontera';

create or replace function public.tg_shop_protect()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.active := old.active;
    new.free_reservations_used := old.free_reservations_used;
    new.owner_id := old.owner_id;
    new.tipo := old.tipo;
    new.fachada := old.fachada;
    new.barrio := old.barrio;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------
-- Seguir tiendas
-- ------------------------------------------------------------------
create table if not exists public.shop_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);
create index if not exists shop_follows_shop_idx on public.shop_follows (shop_id);
alter table public.shop_follows enable row level security;
create policy shop_follows_self_select on public.shop_follows for select to authenticated using (user_id = auth.uid());
create policy shop_follows_self_insert on public.shop_follows for insert to authenticated with check (user_id = auth.uid() and is_verified(auth.uid()));
create policy shop_follows_self_delete on public.shop_follows for delete to authenticated using (user_id = auth.uid());

-- Cuántos vecinos siguen cada tienda (sin decir quiénes)
create or replace function public.shop_follower_counts()
returns table (shop_id uuid, followers integer)
language sql stable security definer set search_path = public as $$
  select shop_id, count(*)::int from shop_follows where is_verified(auth.uid()) group by shop_id;
$$;

-- La tienda que te verifica pasa a estar en tu barrio.
create or replace function public.tg_follow_verifier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verified_by_shop is not null and new.verified_by_shop is distinct from old.verified_by_shop then
    insert into shop_follows (user_id, shop_id) values (new.id, new.verified_by_shop) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger profile_follow_verifier after update on public.profiles for each row execute function public.tg_follow_verifier();
insert into public.shop_follows (user_id, shop_id)
  select id, verified_by_shop from public.profiles where verified_by_shop is not null on conflict do nothing;

-- Aviso prioritario a quien sigue la tienda cuando publica una oferta o el menú del día.
create or replace function public.tg_offer_followers()
returns trigger language plpgsql security definer set search_path = public as $$
declare tienda text; r record;
begin
  select name into tienda from shops where id = new.shop_id;
  for r in select user_id from shop_follows where shop_id = new.shop_id loop
    perform notify(r.user_id, 'tienda', tienda || ': ' || new.title, 'Te avisamos antes que a nadie porque sigues a esta tienda.');
  end loop;
  return new;
end $$;
create trigger offer_followers after insert on public.offers for each row execute function public.tg_offer_followers();

create or replace function public.tg_menu_followers()
returns trigger language plpgsql security definer set search_path = public as $$
declare tienda text; r record;
begin
  select name into tienda from shops where id = new.shop_id;
  for r in select user_id from shop_follows where shop_id = new.shop_id loop
    perform notify(r.user_id, 'tienda', tienda || ': menú del día', left(new.mains, 120));
  end loop;
  return new;
end $$;
create trigger menu_followers after insert on public.menus for each row execute function public.tg_menu_followers();

-- ------------------------------------------------------------------
-- Alta de tiendas
-- ------------------------------------------------------------------
-- 1) Reclamar: Stoop da de alta la tienda tras la visita y deja un código en una tarjeta.
create table if not exists public.shop_claims (
  code text primary key check (code ~ '^[A-Z2-9]{8}$'),
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz
);
alter table public.shop_claims enable row level security;  -- sin políticas: solo se usa con claim_shop()

create or replace function public.claim_shop(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare c shop_claims%rowtype; nombre text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  select * into c from shop_claims where code = upper(replace(trim(p_code), ' ', '')) for update;
  if not found then raise exception 'Ese código no existe. Revisa la tarjeta que te dejamos.'; end if;
  if c.used_at is not null then raise exception 'Ese código ya se usó. Escríbenos si es tu tienda.'; end if;
  update shops set owner_id = auth.uid(), active = true where id = c.shop_id returning name into nombre;
  update shop_claims set used_by = auth.uid(), used_at = now() where code = c.code;
  return nombre;
end $$;

-- 2) Pedir el alta: queda pendiente hasta que Stoop visita la tienda.
create table if not exists public.shop_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  tipo text not null check (tipo in ('tienda', 'restaurante')),
  category text not null check (category in ('fruteria', 'panaderia', 'peluqueria', 'carniceria', 'pescaderia', 'otra')),
  street text not null check (char_length(street) between 3 and 80),
  nif text not null check (char_length(nif) between 8 and 12),
  independent boolean not null,
  phone text check (phone is null or char_length(phone) <= 20),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now(),
  check (independent)
);
alter table public.shop_requests enable row level security;
create policy shop_requests_self_select on public.shop_requests for select to authenticated using (user_id = auth.uid());
create policy shop_requests_self_insert on public.shop_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pendiente');
create policy shop_requests_no_delete on public.shop_requests as restrictive for delete using (false);

revoke execute on function public.tg_follow_verifier() from public, anon, authenticated;
revoke execute on function public.tg_offer_followers() from public, anon, authenticated;
revoke execute on function public.tg_menu_followers() from public, anon, authenticated;
revoke execute on function public.shop_follower_counts() from public, anon;
grant execute on function public.shop_follower_counts() to authenticated;
revoke execute on function public.claim_shop(text) from public, anon;
grant execute on function public.claim_shop(text) to authenticated;
