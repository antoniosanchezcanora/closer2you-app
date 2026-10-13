-- Stoop: avisos dentro de la app, agenda del barrio, borrar la cuenta y acceso a la Fase 2.

-- ------------------------------------------------------------------
-- Fase 2 solo para quien activemos nosotros (pruebas), nunca desde la app.
-- ------------------------------------------------------------------
alter table public.profiles add column if not exists fase2 boolean not null default false;

create or replace function public.tg_profile_protect()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verify_method := null; new.verified_by_shop := null; new.fase2 := false;
    else
      new.verified_at := old.verified_at;
      new.verify_method := old.verify_method;
      new.verified_by_shop := old.verified_by_shop;
      new.fase2 := old.fase2;
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------
-- Avisos (bandeja dentro de la app). Solo los crea la base de datos.
-- ------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('reserva', 'tienda', 'verificado', 'evento', 'sistema')),
  title text not null check (char_length(title) <= 80),
  body text check (body is null or char_length(body) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_self_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_self_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body) values (p_user, p_kind, left(p_title, 80), left(p_body, 200));
$$;

-- Reservas de ofertas: aviso a la tienda al reservar o cancelar, y al vecino cuando cambia el estado.
create or replace function public.tg_reservation_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; titulo text; vecino text; tienda text;
begin
  select s.owner_id, s.name into owner, tienda from shops s where s.id = new.shop_id;
  select o.title into titulo from offers o where o.id = new.offer_id;
  select p.display_name into vecino from profiles p where p.id = new.neighbour_id;
  if tg_op = 'INSERT' then
    perform notify(owner, 'tienda', 'Nueva reserva: ' || titulo,
      vecino || case when new.mode = 'entrega' then ' · a domicilio' || coalesce(' · ' || new.delivery_slot, '') else ' · recoge en tienda' end);
  elsif new.status <> old.status then
    if new.status = 'lista' then
      perform notify(new.neighbour_id, 'reserva', case when new.mode = 'entrega' then 'Tu reserva va en camino' else 'Tu reserva está lista' end, tienda || ' · ' || titulo);
    elsif new.status = 'rechazada' then
      perform notify(new.neighbour_id, 'reserva', 'No le quedaba', tienda || ' no tiene ya ' || titulo || '. No pagas nada.');
    elsif new.status = 'recogida' then
      perform notify(new.neighbour_id, 'reserva', '¡Gracias por comprar en tu calle!', tienda || ' · ' || titulo);
    elsif new.status = 'cancelada' then
      perform notify(owner, 'tienda', vecino || ' ha cancelado', titulo);
    end if;
  end if;
  return new;
end $$;
create trigger reservation_notify after insert or update on public.reservations for each row execute function public.tg_reservation_notify();

create or replace function public.tg_menu_res_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; vecino text; tienda text;
begin
  select s.owner_id, s.name into owner, tienda from shops s where s.id = new.shop_id;
  select p.display_name into vecino from profiles p where p.id = new.neighbour_id;
  if tg_op = 'INSERT' then
    perform notify(owner, 'tienda', 'Menú reservado · ' || new.at_time,
      vecino || ' · ' || case new.mode when 'aqui' then 'come aquí' when 'llevar' then 'para llevar' else 'a domicilio' end || case when new.qty > 1 then ' · ' || new.qty || ' menús' else '' end);
  elsif new.status <> old.status then
    if new.status = 'lista' then
      perform notify(new.neighbour_id, 'reserva', 'Tu menú está confirmado', tienda || ' · ' || new.at_time);
    elsif new.status = 'rechazada' then
      perform notify(new.neighbour_id, 'reserva', 'Ya no quedaban menús', tienda || '. No pagas nada.');
    elsif new.status = 'cancelada' then
      perform notify(owner, 'tienda', vecino || ' ha cancelado su menú', new.at_time);
    end if;
  end if;
  return new;
end $$;
create trigger menu_res_notify after insert or update on public.menu_reservations for each row execute function public.tg_menu_res_notify();

create or replace function public.tg_profile_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare tienda text;
begin
  if new.verified_at is not null and old.verified_at is null then
    select name into tienda from shops where id = new.verified_by_shop;
    perform notify(new.id, 'verificado', 'Ya eres vecino verificado', 'Te ha verificado ' || coalesce(tienda, 'una tienda del barrio') || '.');
  end if;
  return new;
end $$;
create trigger profile_notify after update on public.profiles for each row execute function public.tg_profile_notify();

alter publication supabase_realtime add table public.notifications;

-- ------------------------------------------------------------------
-- Agenda del barrio
-- ------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  shop_id uuid references public.shops (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  category text not null check (category in ('deporte', 'cultura', 'ninos', 'mayores', 'barrio')),
  starts_at timestamptz not null,
  place text not null check (char_length(place) between 2 and 120),
  capacity integer check (capacity is null or capacity between 1 and 500),
  price_text text not null default 'Gratis' check (char_length(price_text) <= 40),
  description text check (description is null or char_length(description) <= 500),
  kids boolean not null default false,
  kids_certified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- LOPIVI art. 57: con niños, quien organiza confirma el certificado negativo de delitos sexuales de los monitores.
  constraint events_kids_certified check (not kids or kids_certified)
);
create index if not exists events_starts_idx on public.events (active, starts_at);
alter table public.events enable row level security;

create policy events_public_select on public.events for select to authenticated using (
  (active and starts_at > now() - interval '6 hours' and is_verified(auth.uid())) or creator_id = auth.uid()
);
create policy events_insert on public.events for insert to authenticated with check (
  creator_id = auth.uid() and is_verified(auth.uid()) and starts_at > now() and (shop_id is null or owns_shop(shop_id))
);
create policy events_creator_update on public.events for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy events_no_delete on public.events as restrictive for delete using (false);

create table if not exists public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_attendees enable row level security;
create policy attendees_self_select on public.event_attendees for select to authenticated using (user_id = auth.uid());
create policy attendees_self_insert on public.event_attendees for insert to authenticated with check (user_id = auth.uid() and is_verified(auth.uid()));
create policy attendees_self_leave on public.event_attendees for delete to authenticated using (user_id = auth.uid());

create or replace function public.tg_attendee_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare e events%rowtype; n integer;
begin
  select * into e from events where id = new.event_id for update;
  if not found or not e.active or e.starts_at < now() then raise exception 'Este evento ya no admite gente'; end if;
  if e.capacity is not null then
    select count(*) into n from event_attendees where event_id = e.id;
    if n >= e.capacity then raise exception 'Ya no quedan plazas'; end if;
  end if;
  return new;
end $$;
create trigger attendee_insert before insert on public.event_attendees for each row execute function public.tg_attendee_insert();

-- Cuántos van a cada evento (sin revelar quién, salvo al organizador en la app más adelante).
create or replace function public.event_counts(ids uuid[])
returns table (event_id uuid, going integer) language sql stable security definer set search_path = public as $$
  select a.event_id, count(*)::int from event_attendees a
  where a.event_id = any(ids) and is_verified(auth.uid())
  group by a.event_id;
$$;

-- ------------------------------------------------------------------
-- Borrar mi cuenta (derecho de supresión, RGPD art. 17): el vecino lo pide desde la app y lo
-- ejecutamos nosotros (plazo legal: un mes, RGPD art. 12.3). Mientras, la cuenta queda desactivada.
-- ------------------------------------------------------------------
create table if not exists public.deletion_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.deletion_requests enable row level security;
create policy deletion_self_select on public.deletion_requests for select to authenticated using (user_id = auth.uid());

create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  insert into deletion_requests (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  -- Desde ya: deja de aparecer como verificado y se anulan sus reservas abiertas.
  update profiles set verified_at = null, verify_method = null, verified_by_shop = null where id = auth.uid();
  update reservations set status = 'cancelada' where neighbour_id = auth.uid() and status in ('nueva', 'lista');
  update menu_reservations set status = 'cancelada' where neighbour_id = auth.uid() and status in ('nueva', 'lista');
end $$;

-- Permisos de ejecución
revoke execute on function public.notify(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.tg_profile_protect() from public, anon, authenticated;
revoke execute on function public.tg_reservation_notify() from public, anon, authenticated;
revoke execute on function public.tg_menu_res_notify() from public, anon, authenticated;
revoke execute on function public.tg_profile_notify() from public, anon, authenticated;
revoke execute on function public.tg_attendee_insert() from public, anon, authenticated;
revoke execute on function public.event_counts(uuid[]) from public, anon;
grant execute on function public.event_counts(uuid[]) to authenticated;
revoke execute on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
