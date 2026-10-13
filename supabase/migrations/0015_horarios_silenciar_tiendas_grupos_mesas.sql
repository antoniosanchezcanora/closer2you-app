-- 1) «Estoy despierto» programable por días y horas (hora de Madrid).
-- 2) Silenciar a alguien de tu gente sin que lo sepa: deja de verse lo social, pero sus avisos de ayuda te siguen llegando.
-- 3) Hablar con una tienda (encargos, preguntas). Vale desde la Fase 1: solo hace falta estar verificado.
-- 4) Grupos con tu gente y 5) reservar mesa en un restaurante desde el grupo; el restaurante confirma en la app.

-- ------------------------------------------------------------------
-- 1) Horario de «despierto»
-- ------------------------------------------------------------------
create table if not exists public.awake_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  days smallint[] not null check (array_length(days, 1) between 1 and 7 and days <@ array[1,2,3,4,5,6,7]::smallint[]),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (start_time <> end_time)
);
alter table public.awake_schedules enable row level security;
create policy awake_schedules_self_all on public.awake_schedules for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and is_fase2(auth.uid()));

create or replace function public.is_awake(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Europe/Madrid') as l)
  select coalesce((select awake_until > now() from presence where user_id = p_user), false)
    or exists (
      select 1 from awake_schedules s, t
      where s.user_id = p_user and extract(isodow from t.l)::smallint = any (s.days)
        and case when s.start_time < s.end_time then t.l::time >= s.start_time and t.l::time < s.end_time
                 else t.l::time >= s.start_time or t.l::time < s.end_time end
    );
$$;

-- ------------------------------------------------------------------
-- 2) Silenciar
-- ------------------------------------------------------------------
create table if not exists public.user_mutes (
  muter_id uuid not null references public.profiles (id) on delete cascade,
  muted_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);
alter table public.user_mutes enable row level security;
create policy user_mutes_self_all on public.user_mutes for all to authenticated using (muter_id = auth.uid()) with check (muter_id = auth.uid());

create or replace function public.is_muted(p_muter uuid, p_muted uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_mutes where muter_id = p_muter and muted_id = p_muted);
$$;

-- La ventana encendida no se ve si has silenciado a esa persona. Ahora también cuenta el horario.
create or replace function public.people_presence()
returns table (other_id uuid, name text, online boolean, awake boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name,
    coalesce(pr.last_seen_at > now() - interval '3 minutes', false),
    is_awake(o.id)
  from trust_links l
  join profiles o on o.id = case when l.from_id = auth.uid() then l.to_id else l.from_id end
  left join presence pr on pr.user_id = o.id
  where l.status = 'aceptada' and auth.uid() in (l.from_id, l.to_id)
    and (is_trusted(o.id, auth.uid(), 'vuelvo') or is_trusted(o.id, auth.uid(), 'cuidado'))
    and not is_blocked(auth.uid(), o.id)
    and not is_muted(auth.uid(), o.id);
$$;

create or replace function public.my_people()
returns table (
  link_id uuid, other_id uuid, name text, status text, i_sent boolean, neighbour boolean,
  i_share_vuelvo boolean, i_share_cuidado boolean, they_share_vuelvo boolean, they_share_cuidado boolean,
  awake boolean, last_ok_at timestamptz
) language sql stable security definer set search_path = public as $$
  select l.id, o.id, o.display_name, l.status, l.from_id = auth.uid(), o.verified_at is not null,
    coalesce(mp.vuelvo, false), coalesce(mp.cuidado, false), coalesce(tp.vuelvo, false), coalesce(tp.cuidado, false),
    case when l.status = 'aceptada' and (coalesce(tp.vuelvo, false) or coalesce(tp.cuidado, false)) then is_awake(o.id) else false end,
    case when l.status = 'aceptada' and coalesce(tp.cuidado, false) then pr.last_ok_at end
  from trust_links l
  join profiles o on o.id = case when l.from_id = auth.uid() then l.to_id else l.from_id end
  left join trust_perms mp on mp.owner_id = auth.uid() and mp.other_id = o.id
  left join trust_perms tp on tp.owner_id = o.id and tp.other_id = auth.uid()
  left join presence pr on pr.user_id = o.id
  where auth.uid() in (l.from_id, l.to_id) and l.status in ('pendiente', 'aceptada') and not is_blocked(auth.uid(), o.id)
  order by l.status, o.display_name;
$$;

-- ------------------------------------------------------------------
-- 3) Chat con una tienda: hilos aparte de los chats entre vecinos
-- ------------------------------------------------------------------
create table if not exists public.shop_threads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  neighbour_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (shop_id, neighbour_id)
);
create table if not exists public.shop_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.shop_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  from_shop boolean not null default false,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists shop_messages_idx on public.shop_messages (thread_id, created_at);
alter table public.shop_threads enable row level security;
alter table public.shop_messages enable row level security;

create or replace function public.in_shop_thread(p_thread uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shop_threads t join shops s on s.id = t.shop_id
                 where t.id = p_thread and (t.neighbour_id = p_user or s.owner_id = p_user));
$$;

create policy shop_threads_select on public.shop_threads for select to authenticated using (neighbour_id = auth.uid() or owns_shop(shop_id));
create policy shop_threads_no_delete on public.shop_threads as restrictive for delete using (false);
create policy shop_messages_select on public.shop_messages for select to authenticated using (in_shop_thread(thread_id, auth.uid()));
create policy shop_messages_insert on public.shop_messages for insert to authenticated with check (sender_id = auth.uid() and in_shop_thread(thread_id, auth.uid()));
create policy shop_messages_no_delete on public.shop_messages as restrictive for delete using (false);
create policy profiles_shop_thread_select on public.profiles for select to authenticated using (
  exists (select 1 from shop_threads t join shops s on s.id = t.shop_id where s.owner_id = auth.uid() and t.neighbour_id = profiles.id)
);

create or replace function public.open_shop_chat(p_shop uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid; s shops%rowtype;
begin
  if not is_verified(auth.uid()) then raise exception 'Confirma primero que eres del barrio'; end if;
  select * into s from shops where id = p_shop and active;
  if not found then raise exception 'Esta tienda no está disponible'; end if;
  if s.owner_id = auth.uid() then raise exception 'Es tu propia tienda'; end if;
  insert into shop_threads (shop_id, neighbour_id) values (p_shop, auth.uid())
    on conflict (shop_id, neighbour_id) do update set shop_id = excluded.shop_id returning id into tid;
  return tid;
end $$;

-- Quién escribe lo decide la base de datos: si eres el dueño de la tienda, firmas como la tienda.
create or replace function public.tg_shop_message_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.from_shop := exists (select 1 from shop_threads t join shops s on s.id = t.shop_id where t.id = new.thread_id and s.owner_id = new.sender_id);
  return new;
end $$;
create trigger shop_message_before before insert on public.shop_messages for each row execute function public.tg_shop_message_before();

create or replace function public.tg_shop_message_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare t shop_threads%rowtype; s shops%rowtype; quien text;
begin
  update shop_threads set last_at = new.created_at where id = new.thread_id returning * into t;
  select * into s from shops where id = t.shop_id;
  if new.from_shop then
    perform notify(t.neighbour_id, 'tienda', 'Mensaje de ' || s.name, left(new.body, 120));
  else
    select display_name into quien from profiles where id = new.sender_id;
    perform notify(s.owner_id, 'tienda', quien || ' escribe a ' || s.name, left(new.body, 120));
  end if;
  return new;
end $$;
create trigger shop_message_after after insert on public.shop_messages for each row execute function public.tg_shop_message_after();

-- Aviso de mensaje entre vecinos: si el destinatario ha silenciado al remitente, no se avisa.
create or replace function public.tg_message_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; dest uuid; quien text;
begin
  select * into c from conversations where id = new.conversation_id;
  update conversations set last_at = new.created_at where id = c.id;
  dest := case when new.sender_id = c.starter_id then c.other_id else c.starter_id end;
  if is_muted(dest, new.sender_id) then return new; end if;
  select display_name into quien from profiles where id = new.sender_id;
  perform notify(dest, 'sistema', 'Mensaje de ' || quien, left(new.body, 120));
  return new;
end $$;

-- ------------------------------------------------------------------
-- 4) Grupos
-- ------------------------------------------------------------------
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, user_id)
);
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'texto' check (kind in ('texto', 'sistema')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_idx on public.group_messages (group_id, created_at);
alter table public.chat_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

create or replace function public.in_group(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = p_user and left_at is null);
$$;

create policy chat_groups_select on public.chat_groups for select to authenticated using (in_group(id, auth.uid()));
create policy chat_groups_no_delete on public.chat_groups as restrictive for delete using (false);
create policy group_members_select on public.group_members for select to authenticated using (in_group(group_id, auth.uid()));
create policy group_messages_select on public.group_messages for select to authenticated using (in_group(group_id, auth.uid()));
create policy group_messages_insert on public.group_messages for insert to authenticated with check (
  sender_id = auth.uid() and kind = 'texto' and is_fase2(auth.uid()) and in_group(group_id, auth.uid())
);
create policy group_messages_no_delete on public.group_messages as restrictive for delete using (false);
create policy profiles_group_select on public.profiles for select to authenticated using (
  exists (select 1 from group_members a join group_members b on a.group_id = b.group_id
          where a.user_id = auth.uid() and a.left_at is null and b.user_id = profiles.id)
);

-- Crear grupo: solo con gente de tu círculo (aceptada) que esté en la Fase 2.
create or replace function public.create_group(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; m uuid; quien text;
begin
  if not is_fase2(auth.uid()) then raise exception 'Todavía no está abierto en tu barrio'; end if;
  if coalesce(array_length(p_members, 1), 0) < 1 then raise exception 'Elige al menos a una persona'; end if;
  if array_length(p_members, 1) > 15 then raise exception 'Un grupo admite hasta 16 personas'; end if;
  insert into chat_groups (name, created_by) values (trim(p_name), auth.uid()) returning id into gid;
  insert into group_members (group_id, user_id) values (gid, auth.uid());
  select display_name into quien from profiles where id = auth.uid();
  foreach m in array p_members loop
    if m = auth.uid() then continue; end if;
    if not exists (select 1 from trust_links where status = 'aceptada'
      and least(from_id, to_id) = least(auth.uid(), m) and greatest(from_id, to_id) = greatest(auth.uid(), m)) or not is_fase2(m) then
      raise exception 'Solo puedes añadir a gente de tu círculo';
    end if;
    insert into group_members (group_id, user_id) values (gid, m) on conflict do nothing;
    perform notify(m, 'sistema', quien || ' te ha añadido a «' || trim(p_name) || '»', 'Lo tienes en Mensajes, Grupos.');
  end loop;
  insert into group_messages (group_id, sender_id, kind, body) values (gid, auth.uid(), 'sistema', quien || ' ha creado el grupo');
  return gid;
end $$;

create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare quien text;
begin
  update group_members set left_at = now() where group_id = p_group and user_id = auth.uid() and left_at is null;
  if found then
    select display_name into quien from profiles where id = auth.uid();
    insert into group_messages (group_id, sender_id, kind, body) values (p_group, auth.uid(), 'sistema', quien || ' ha salido del grupo');
  end if;
end $$;

create or replace function public.tg_group_message_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare g chat_groups%rowtype; quien text; r record;
begin
  update chat_groups set last_at = new.created_at where id = new.group_id returning * into g;
  if new.kind <> 'texto' then return new; end if;
  select display_name into quien from profiles where id = new.sender_id;
  for r in select user_id from group_members where group_id = new.group_id and left_at is null and user_id <> new.sender_id loop
    if not is_muted(r.user_id, new.sender_id) then
      perform notify(r.user_id, 'sistema', g.name || ' · ' || quien, left(new.body, 120));
    end if;
  end loop;
  return new;
end $$;
create trigger group_message_after after insert on public.group_messages for each row execute function public.tg_group_message_after();

-- ------------------------------------------------------------------
-- 5) Reservar mesa (desde un grupo o solo)
-- ------------------------------------------------------------------
alter table public.shops add column if not exists tables_enabled boolean not null default false;
alter table public.shops add column if not exists tables_max_party smallint not null default 8 check (tables_max_party between 1 and 40);

create table if not exists public.table_bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.chat_groups (id) on delete set null,
  party smallint not null check (party between 1 and 40),
  at timestamptz not null,
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'propuesta', 'rechazada', 'cancelada')),
  proposed_at timestamptz,
  shop_note text check (shop_note is null or char_length(shop_note) <= 200),
  created_at timestamptz not null default now()
);
alter table public.table_bookings enable row level security;
create policy table_bookings_select on public.table_bookings for select to authenticated using (
  requester_id = auth.uid() or owns_shop(shop_id) or (group_id is not null and in_group(group_id, auth.uid()))
);
create policy table_bookings_no_delete on public.table_bookings as restrictive for delete using (false);
create policy profiles_table_booking_select on public.profiles for select to authenticated using (
  exists (select 1 from table_bookings b join shops s on s.id = b.shop_id where s.owner_id = auth.uid() and b.requester_id = profiles.id)
);

create or replace function public.booking_text(p_at timestamptz)
returns text language sql immutable as $$
  select to_char(p_at at time zone 'Europe/Madrid', 'DD/MM') || ' a las ' || to_char(p_at at time zone 'Europe/Madrid', 'HH24:MI');
$$;

create or replace function public.request_table(p_shop uuid, p_group uuid, p_party integer, p_at timestamptz, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s shops%rowtype; bid uuid; quien text;
begin
  if not is_verified(auth.uid()) then raise exception 'Confirma primero que eres del barrio'; end if;
  select * into s from shops where id = p_shop and active;
  if not found or s.tipo <> 'restaurante' or not s.tables_enabled then raise exception 'Este restaurante no acepta reservas de mesa en la app'; end if;
  if p_party < 1 or p_party > s.tables_max_party then raise exception 'Este restaurante acepta grupos de hasta % personas', s.tables_max_party; end if;
  if p_at < now() + interval '30 minutes' or p_at > now() + interval '60 days' then raise exception 'Elige una hora a partir de dentro de media hora'; end if;
  if p_group is not null and not in_group(p_group, auth.uid()) then raise exception 'No estás en ese grupo'; end if;
  insert into table_bookings (shop_id, requester_id, group_id, party, at, note)
    values (p_shop, auth.uid(), p_group, p_party, p_at, nullif(trim(coalesce(p_note, '')), '')) returning id into bid;
  select display_name into quien from profiles where id = auth.uid();
  perform notify(s.owner_id, 'tienda', 'Mesa para ' || p_party || ': ' || quien, booking_text(p_at));
  if p_group is not null then
    insert into group_messages (group_id, sender_id, kind, body)
      values (p_group, auth.uid(), 'sistema', quien || ' ha pedido mesa para ' || p_party || ' en ' || s.name || ', ' || booking_text(p_at) || '. Esperando a que confirme.');
  end if;
  return bid;
end $$;

-- El restaurante confirma, rechaza o propone otra hora. El que pidió acepta la propuesta o cancela.
create or replace function public.answer_table(p_booking uuid, p_status text, p_proposed timestamptz, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare b table_bookings%rowtype; s shops%rowtype; is_shop boolean; msg text; r record;
begin
  select * into b from table_bookings where id = p_booking for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  select * into s from shops where id = b.shop_id;
  is_shop := s.owner_id = auth.uid();
  if is_shop then
    if b.status <> 'pendiente' or p_status not in ('confirmada', 'rechazada', 'propuesta') then raise exception 'No se puede responder a esta reserva'; end if;
    if p_status = 'propuesta' and (p_proposed is null or p_proposed < now()) then raise exception 'Indica la hora que propones'; end if;
    update table_bookings set status = p_status, proposed_at = case when p_status = 'propuesta' then p_proposed end, shop_note = nullif(trim(coalesce(p_note, '')), '') where id = b.id;
    msg := s.name || case p_status when 'confirmada' then ' confirma la mesa para ' || b.party || ', ' || booking_text(b.at)
                                   when 'rechazada' then ' no tiene mesa ' || booking_text(b.at)
                                   else ' propone otra hora: ' || booking_text(p_proposed) end
           || coalesce('. «' || nullif(trim(coalesce(p_note, '')), '') || '»', '');
    perform notify(b.requester_id, 'tienda', msg, null);
  elsif b.requester_id = auth.uid() then
    if p_status = 'confirmada' and b.status = 'propuesta' then
      update table_bookings set status = 'confirmada', at = proposed_at, proposed_at = null where id = b.id returning * into b;
      msg := 'Mesa confirmada en ' || s.name || ' para ' || b.party || ', ' || booking_text(b.at);
      perform notify(s.owner_id, 'tienda', 'Aceptan tu hora: mesa para ' || b.party, booking_text(b.at));
    elsif p_status = 'cancelada' and b.status in ('pendiente', 'confirmada', 'propuesta') then
      update table_bookings set status = 'cancelada' where id = b.id;
      msg := 'Se ha cancelado la mesa en ' || s.name;
      perform notify(s.owner_id, 'tienda', 'Cancelan la mesa para ' || b.party, booking_text(b.at));
    else
      raise exception 'No se puede cambiar esta reserva';
    end if;
  else
    raise exception 'No es tu reserva';
  end if;
  if b.group_id is not null then
    insert into group_messages (group_id, sender_id, kind, body) values (b.group_id, null, 'sistema', msg);
    for r in select user_id from group_members where group_id = b.group_id and left_at is null and user_id <> b.requester_id loop
      perform notify(r.user_id, 'sistema', msg, null);
    end loop;
  end if;
end $$;

alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.shop_messages;
alter publication supabase_realtime add table public.table_bookings;

revoke execute on function public.is_awake(uuid) from public, anon;
grant execute on function public.is_awake(uuid) to authenticated;
revoke execute on function public.is_muted(uuid, uuid) from public, anon;
grant execute on function public.is_muted(uuid, uuid) to authenticated;
revoke execute on function public.in_shop_thread(uuid, uuid) from public, anon;
grant execute on function public.in_shop_thread(uuid, uuid) to authenticated;
revoke execute on function public.tg_shop_message_before() from public, anon, authenticated;
revoke execute on function public.tg_shop_message_after() from public, anon, authenticated;
revoke execute on function public.open_shop_chat(uuid) from public, anon;
grant execute on function public.open_shop_chat(uuid) to authenticated;
revoke execute on function public.in_group(uuid, uuid) from public, anon;
grant execute on function public.in_group(uuid, uuid) to authenticated;
revoke execute on function public.create_group(text, uuid[]) from public, anon;
grant execute on function public.create_group(text, uuid[]) to authenticated;
revoke execute on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;
revoke execute on function public.tg_group_message_after() from public, anon, authenticated;
revoke execute on function public.request_table(uuid, uuid, integer, timestamptz, text) from public, anon;
grant execute on function public.request_table(uuid, uuid, integer, timestamptz, text) to authenticated;
revoke execute on function public.answer_table(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.answer_table(uuid, text, timestamptz, text) to authenticated;
