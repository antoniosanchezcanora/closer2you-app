-- Stoop: fichas de tienda, recoger o que te lo traigan, y restaurantes con menú del día.
-- Sin borrar nada: solo columnas, tablas, funciones y políticas nuevas.

-- ------------------------------------------------------------------
-- Tiendas: tipo, fachada, presentación y reglas de entrega
-- ------------------------------------------------------------------
alter table public.shops
  add column if not exists tipo text not null default 'tienda' check (tipo in ('tienda', 'restaurante')),
  add column if not exists fachada text not null default 'otra' check (fachada in ('fruta', 'pan', 'libros', 'bar', 'otra')),
  add column if not exists about text check (about is null or char_length(about) <= 280),
  add column if not exists delivery_enabled boolean not null default false,
  add column if not exists delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  add column if not exists delivery_free_from_cents integer check (delivery_free_from_cents is null or delivery_free_from_cents > 0),
  add column if not exists delivery_radius_m integer not null default 500 check (delivery_radius_m between 100 and 3000),
  add column if not exists delivery_slots text[] not null default '{}',
  add column if not exists delivery_by text check (delivery_by is null or char_length(delivery_by) <= 40);

-- El dueño puede cambiar su presentación y su entrega, pero no el tipo ni la fachada (los ponemos en el alta).
create or replace function public.tg_shop_protect()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.active := old.active;
    new.free_reservations_used := old.free_reservations_used;
    new.owner_id := old.owner_id;
    new.tipo := old.tipo;
    new.fachada := old.fachada;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------
-- Reservas: recoger o que te lo traigan
-- ------------------------------------------------------------------
alter table public.reservations
  add column if not exists mode text not null default 'recogida' check (mode in ('recogida', 'entrega')),
  add column if not exists delivery_address text check (delivery_address is null or char_length(delivery_address) <= 140),
  add column if not exists delivery_slot text check (delivery_slot is null or char_length(delivery_slot) <= 40),
  add column if not exists delivery_fee_cents integer;

create or replace function public.tg_reservation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare o offers%rowtype; s shops%rowtype;
begin
  select * into o from offers where id = new.offer_id for update;
  if not found then raise exception 'La oferta ya no está disponible'; end if;
  select * into s from shops where id = o.shop_id;
  if not o.active or o.until < now() or not s.active then
    raise exception 'La oferta ya no está disponible';
  end if;
  if o.qty_left < new.qty then
    raise exception 'No quedan suficientes unidades';
  end if;
  if new.mode = 'entrega' then
    if not s.delivery_enabled then raise exception 'Esta tienda no hace entregas'; end if;
    if coalesce(trim(new.delivery_address), '') = '' then raise exception 'Falta la dirección de entrega'; end if;
    new.delivery_fee_cents := case
      when s.delivery_free_from_cents is not null and o.price_cents * new.qty >= s.delivery_free_from_cents then 0
      else s.delivery_fee_cents end;
  else
    new.delivery_address := null; new.delivery_slot := null; new.delivery_fee_cents := null;
  end if;
  update offers set qty_left = qty_left - new.qty where id = o.id;
  new.shop_id := o.shop_id;
  new.status := 'nueva';
  return new;
end $$;

create or replace function public.tg_reservation_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_owner boolean := owns_shop(old.shop_id);
begin
  if new.offer_id <> old.offer_id or new.shop_id <> old.shop_id
     or new.neighbour_id <> old.neighbour_id or new.qty <> old.qty
     or new.mode <> old.mode or new.delivery_fee_cents is distinct from old.delivery_fee_cents
     or (new.delivery_address is distinct from old.delivery_address and new.delivery_address is not null) then
    raise exception 'Solo se puede cambiar el estado de una reserva';
  end if;

  if new.status <> old.status then
    if is_owner then
      if not ((old.status = 'nueva' and new.status in ('lista', 'rechazada'))
           or (old.status = 'lista' and new.status in ('recogida', 'no_show'))) then
        raise exception 'Cambio de estado no permitido';
      end if;
    elsif auth.uid() = old.neighbour_id then
      if not (old.status in ('nueva', 'lista') and new.status = 'cancelada') then
        raise exception 'Solo puedes cancelar tu reserva';
      end if;
    else
      raise exception 'Sin permiso';
    end if;

    if new.status = 'cancelada' then
      update offers set qty_left = qty_left + old.qty where id = old.offer_id;
    elsif new.status = 'rechazada' then
      update offers set qty_left = 0 where id = old.offer_id;
    end if;

    if new.status = 'recogida' then
      update shops set free_reservations_used = least(free_reservations_used + 1, 10) where id = old.shop_id;
    end if;

    -- La dirección solo vive mientras dura el pedido.
    if new.status in ('recogida', 'rechazada', 'cancelada', 'no_show') then
      new.delivery_address := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------------
-- Menú del día (solo restaurantes). No cuenta como oferta.
-- ------------------------------------------------------------------
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Madrid')::date,
  starters text not null check (char_length(starters) between 2 and 200),
  mains text not null check (char_length(mains) between 2 and 200),
  includes text check (includes is null or char_length(includes) <= 120),
  price_cents integer not null check (price_cents > 0),
  qty_total integer not null check (qty_total between 1 and 200),
  qty_left integer not null check (qty_left >= 0),
  until timestamptz not null,
  allergens text[] not null,               -- obligatorio (RD 126/2015); vacío = declarado sin alérgenos
  takeaway boolean not null default true,
  delivery boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, day)
);
alter table public.menus enable row level security;

create or replace function public.tg_menu_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare s shops%rowtype;
begin
  select * into s from shops where id = new.shop_id;
  if not found or s.tipo <> 'restaurante' then raise exception 'Solo los restaurantes publican menú del día'; end if;
  new.day := (now() at time zone 'Europe/Madrid')::date;
  new.qty_left := new.qty_total;
  new.active := true;
  if new.delivery and not s.delivery_enabled then new.delivery := false; end if;
  return new;
end $$;
create trigger menu_insert before insert on public.menus for each row execute function public.tg_menu_insert();

create or replace function public.tg_menu_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.shop_id <> old.shop_id or new.day <> old.day then raise exception 'No se puede mover un menú'; end if;
    if new.active and not old.active then raise exception 'Un menú cerrado no se reabre'; end if;
    if new.qty_left > new.qty_total then new.qty_left := new.qty_total; end if;
  end if;
  return new;
end $$;
create trigger menu_update before update on public.menus for each row execute function public.tg_menu_update();

create policy menus_public_select on public.menus for select to authenticated using (
  active and until > now() and is_verified(auth.uid())
  and exists (select 1 from public.shops s where s.id = menus.shop_id and s.active)
);
create policy menus_owner_all on public.menus for all to authenticated
  using (owns_shop(shop_id)) with check (owns_shop(shop_id));
create policy menus_no_delete on public.menus as restrictive for delete using (false);

-- ------------------------------------------------------------------
-- Reservas de menú: comer allí, para llevar o que te lo traigan
-- ------------------------------------------------------------------
create table if not exists public.menu_reservations (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus (id) on delete restrict,
  shop_id uuid not null references public.shops (id) on delete restrict,
  neighbour_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('aqui', 'llevar', 'entrega')),
  at_time text not null check (char_length(at_time) between 4 and 5),   -- '14:30'
  qty integer not null default 1 check (qty between 1 and 4),
  delivery_address text check (delivery_address is null or char_length(delivery_address) <= 140),
  note text check (note is null or char_length(note) <= 140),
  status text not null default 'nueva' check (status in ('nueva', 'lista', 'recogida', 'rechazada', 'cancelada', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_res_shop_idx on public.menu_reservations (shop_id, created_at desc);
create index if not exists menu_res_neighbour_idx on public.menu_reservations (neighbour_id, created_at desc);
alter table public.menu_reservations enable row level security;

create or replace function public.tg_menu_res_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare m menus%rowtype;
begin
  select * into m from menus where id = new.menu_id for update;
  if not found or not m.active or m.until < now()
     or not exists (select 1 from shops s where s.id = m.shop_id and s.active) then
    raise exception 'El menú de hoy ya no está disponible';
  end if;
  if m.qty_left < new.qty then raise exception 'No quedan menús suficientes'; end if;
  if new.mode = 'llevar' and not m.takeaway then raise exception 'Hoy no hay menú para llevar'; end if;
  if new.mode = 'entrega' then
    if not m.delivery then raise exception 'Hoy no llevan el menú a casa'; end if;
    if coalesce(trim(new.delivery_address), '') = '' then raise exception 'Falta la dirección de entrega'; end if;
  else
    new.delivery_address := null;
  end if;
  update menus set qty_left = qty_left - new.qty where id = m.id;
  new.shop_id := m.shop_id;
  new.status := 'nueva';
  return new;
end $$;
create trigger menu_res_insert before insert on public.menu_reservations for each row execute function public.tg_menu_res_insert();

create or replace function public.tg_menu_res_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_owner boolean := owns_shop(old.shop_id);
begin
  if new.menu_id <> old.menu_id or new.shop_id <> old.shop_id or new.neighbour_id <> old.neighbour_id
     or new.qty <> old.qty or new.mode <> old.mode or new.at_time <> old.at_time
     or (new.delivery_address is distinct from old.delivery_address and new.delivery_address is not null) then
    raise exception 'Solo se puede cambiar el estado de una reserva';
  end if;
  if new.status <> old.status then
    if is_owner then
      if not ((old.status = 'nueva' and new.status in ('lista', 'rechazada'))
           or (old.status = 'lista' and new.status in ('recogida', 'no_show'))) then
        raise exception 'Cambio de estado no permitido';
      end if;
    elsif auth.uid() = old.neighbour_id then
      if not (old.status in ('nueva', 'lista') and new.status = 'cancelada') then
        raise exception 'Solo puedes cancelar tu reserva';
      end if;
    else
      raise exception 'Sin permiso';
    end if;
    if new.status = 'cancelada' then
      update menus set qty_left = least(qty_total, qty_left + old.qty) where id = old.menu_id;
    elsif new.status = 'rechazada' then
      update menus set qty_left = 0 where id = old.menu_id;
    end if;
    if new.status in ('recogida', 'rechazada', 'cancelada', 'no_show') then
      new.delivery_address := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger menu_res_update before update on public.menu_reservations for each row execute function public.tg_menu_res_update();

create policy menu_res_neighbour_select on public.menu_reservations for select to authenticated using (neighbour_id = auth.uid());
create policy menu_res_neighbour_insert on public.menu_reservations for insert to authenticated
  with check (neighbour_id = auth.uid() and is_verified(auth.uid()));
create policy menu_res_neighbour_update on public.menu_reservations for update to authenticated using (neighbour_id = auth.uid());
create policy menu_res_owner_select on public.menu_reservations for select to authenticated using (owns_shop(shop_id));
create policy menu_res_owner_update on public.menu_reservations for update to authenticated using (owns_shop(shop_id));
create policy menu_res_no_delete on public.menu_reservations as restrictive for delete using (false);

-- El vecino ve el menú que reservó aunque ya esté cerrado; la tienda ve el nombre de quien le reserva un menú.
create policy menus_reserved_select on public.menus for select to authenticated using (
  exists (select 1 from public.menu_reservations r where r.menu_id = menus.id and r.neighbour_id = auth.uid())
);
create policy profiles_menu_shop_select on public.profiles for select to authenticated using (
  exists (select 1 from public.menu_reservations r where r.neighbour_id = profiles.id and owns_shop(r.shop_id))
);

alter publication supabase_realtime add table public.menu_reservations;

-- Las funciones de disparador no se llaman desde la API.
revoke execute on function public.tg_reservation_insert() from public, anon, authenticated;
revoke execute on function public.tg_reservation_update() from public, anon, authenticated;
revoke execute on function public.tg_shop_protect() from public, anon, authenticated;
revoke execute on function public.tg_menu_insert() from public, anon, authenticated;
revoke execute on function public.tg_menu_update() from public, anon, authenticated;
revoke execute on function public.tg_menu_res_insert() from public, anon, authenticated;
revoke execute on function public.tg_menu_res_update() from public, anon, authenticated;
