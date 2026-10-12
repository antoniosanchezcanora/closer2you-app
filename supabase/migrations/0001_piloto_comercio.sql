-- Stoop: piloto de comercio (General Lacy y alrededores)
-- Solo reservas: no hay pagos dentro de la app.
-- Las tiendas las damos de alta nosotros en persona (service role); nadie puede crear una tienda desde la app.


-- ------------------------------------------------------------------
-- Vecinos
-- ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  street text,                         -- solo la calle, nunca portal ni piso
  verified_at timestamptz,
  verify_method text check (verify_method in ('tienda', 'factura', 'dni')),
  verified_by_shop uuid,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Tiendas
-- ------------------------------------------------------------------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  name text not null,
  category text not null check (category in ('fruteria', 'panaderia', 'peluqueria', 'carniceria', 'pescaderia', 'otra')),
  street text not null,
  hours text,
  active boolean not null default false,            -- lo activamos tras la visita
  free_reservations_used integer not null default 0,
  billing_plan text check (billing_plan in ('porcentaje', 'mensual')),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_verified_by_shop_fkey foreign key (verified_by_shop) references public.shops (id) on delete set null;

-- ------------------------------------------------------------------
-- Ofertas
-- ------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 60),
  unit text not null default 'unidad',
  price_cents integer not null check (price_cents >= 0),
  old_price_cents integer check (old_price_cents is null or old_price_cents >= price_cents),
  qty_left integer not null check (qty_left >= 0),
  until timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index offers_live_idx on public.offers (shop_id, active, until);

-- ------------------------------------------------------------------
-- Reservas
-- ------------------------------------------------------------------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete restrict,
  shop_id uuid not null references public.shops (id) on delete restrict,
  neighbour_id uuid not null references public.profiles (id) on delete cascade,
  qty integer not null default 1 check (qty between 1 and 10),
  pickup_at timestamptz,
  note text check (note is null or char_length(note) <= 140),
  status text not null default 'nueva'
    check (status in ('nueva', 'lista', 'recogida', 'rechazada', 'cancelada', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reservations_shop_idx on public.reservations (shop_id, status, created_at desc);
create index reservations_neighbour_idx on public.reservations (neighbour_id, created_at desc);

-- ------------------------------------------------------------------
-- Códigos de verificación en tienda (el vecino enseña el código, la tienda lo confirma)
-- ------------------------------------------------------------------
create table public.verification_codes (
  code text primary key,
  neighbour_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);

-- ------------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------------
create or replace function public.is_verified(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and verified_at is not null);
$$;

create or replace function public.owns_shop(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shops where id = sid and owner_id = auth.uid());
$$;

-- ------------------------------------------------------------------
-- Reglas de negocio en triggers
-- ------------------------------------------------------------------

-- Al reservar: la oferta tiene que estar viva y con unidades; se descuentan.
create or replace function public.tg_reservation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare o offers%rowtype;
begin
  select * into o from offers where id = new.offer_id for update;
  if not found or not o.active or o.until < now() then
    raise exception 'La oferta ya no está disponible';
  end if;
  if o.qty_left < new.qty then
    raise exception 'No quedan suficientes unidades';
  end if;
  update offers set qty_left = qty_left - new.qty where id = o.id;
  new.shop_id := o.shop_id;
  new.status := 'nueva';
  return new;
end $$;
create trigger reservation_insert before insert on public.reservations
  for each row execute function public.tg_reservation_insert();

-- Cambios de estado permitidos y contador de reservas gratis.
create or replace function public.tg_reservation_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_owner boolean := owns_shop(old.shop_id);
begin
  if new.offer_id <> old.offer_id or new.shop_id <> old.shop_id
     or new.neighbour_id <> old.neighbour_id or new.qty <> old.qty then
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

    -- devolver unidades si no se lleva
    if new.status in ('rechazada', 'cancelada') then
      update offers set qty_left = qty_left + old.qty where id = old.offer_id;
    end if;

    -- solo cuentan las reservas recogidas
    if new.status = 'recogida' then
      update shops set free_reservations_used = least(free_reservations_used + 1, 10)
        where id = old.shop_id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;
create trigger reservation_update before update on public.reservations
  for each row execute function public.tg_reservation_update();

-- El dueño no puede tocar activación, contador ni plan desde la app.
create or replace function public.tg_shop_protect()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then  -- llamadas directas desde la app, no desde funciones internas
    new.active := old.active;
    new.free_reservations_used := old.free_reservations_used;
    new.owner_id := old.owner_id;
  end if;
  return new;
end $$;
create trigger shop_protect before update on public.shops
  for each row execute function public.tg_shop_protect();

-- El vecino no puede verificarse a sí mismo.
create or replace function public.tg_profile_protect()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then  -- llamadas directas desde la app, no desde funciones internas
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verify_method := null; new.verified_by_shop := null;
    else
      new.verified_at := old.verified_at;
      new.verify_method := old.verify_method;
      new.verified_by_shop := old.verified_by_shop;
    end if;
  end if;
  return new;
end $$;
create trigger profile_protect before insert or update on public.profiles
  for each row execute function public.tg_profile_protect();

-- ------------------------------------------------------------------
-- Funciones que llama la app
-- ------------------------------------------------------------------

-- El vecino pide un código para enseñarlo en una tienda.
create or replace function public.request_shop_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  delete from verification_codes where neighbour_id = auth.uid() and used_at is null;
  loop
    c := 'LACY-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from verification_codes where code = c);
  end loop;
  insert into verification_codes (code, neighbour_id) values (c, auth.uid());
  return c;
end $$;

-- La tienda confirma a un vecino con su código.
create or replace function public.confirm_neighbour(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v verification_codes%rowtype; s uuid; n text;
begin
  select id into s from shops where owner_id = auth.uid() and active limit 1;
  if s is null then raise exception 'Solo una tienda activa puede confirmar vecinos'; end if;
  select * into v from verification_codes
    where code = upper(trim(p_code)) and used_at is null and expires_at > now();
  if not found then raise exception 'Código no válido o caducado'; end if;
  update verification_codes set used_at = now() where code = v.code;
  update profiles set verified_at = now(), verify_method = 'tienda', verified_by_shop = s
    where id = v.neighbour_id
    returning display_name into n;
  return n;
end $$;

-- ------------------------------------------------------------------
-- Seguridad por filas
-- ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.offers enable row level security;
alter table public.reservations enable row level security;
alter table public.verification_codes enable row level security;

-- perfiles: cada uno el suyo; la tienda ve el nombre de quien le reserva
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid());
create policy profiles_shop_select on public.profiles for select using (
  exists (select 1 from reservations r where r.neighbour_id = profiles.id and owns_shop(r.shop_id))
);

-- tiendas: los vecinos verificados ven las activas; el dueño ve y edita la suya
create policy shops_public_select on public.shops for select using (active and is_verified(auth.uid()));
create policy shops_owner_select on public.shops for select using (owner_id = auth.uid());
create policy shops_owner_update on public.shops for update using (owner_id = auth.uid());

-- ofertas
create policy offers_public_select on public.offers for select using (
  active and until > now() and is_verified(auth.uid())
  and exists (select 1 from shops s where s.id = offers.shop_id and s.active)
);
create policy offers_owner_all on public.offers for all
  using (owns_shop(shop_id)) with check (owns_shop(shop_id));

-- reservas
create policy reservations_neighbour_select on public.reservations for select using (neighbour_id = auth.uid());
create policy reservations_neighbour_insert on public.reservations for insert
  with check (neighbour_id = auth.uid() and is_verified(auth.uid()));
create policy reservations_neighbour_update on public.reservations for update using (neighbour_id = auth.uid());
create policy reservations_owner_select on public.reservations for select using (owns_shop(shop_id));
create policy reservations_owner_update on public.reservations for update using (owns_shop(shop_id));

-- códigos: solo a través de las funciones
create policy codes_self_select on public.verification_codes for select using (neighbour_id = auth.uid());

-- Tiempo real para que la tienda vea las reservas al momento
alter publication supabase_realtime add table public.reservations;
