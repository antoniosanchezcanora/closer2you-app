-- Stoop Fase 2: Mi gente (círculo de confianza con aceptación mutua y permisos por persona) y Cuidarnos
-- (necesito ayuda, estoy bien, vuelvo a casa con ubicación solo con la app abierta, despiertos).
-- Nada de esto sustituye al 112: la app lo muestra siempre.

-- ------------------------------------------------------------------
-- Mi gente
-- ------------------------------------------------------------------
create table if not exists public.trust_links (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada', 'retirada')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (from_id <> to_id)
);
create unique index if not exists trust_links_pair on public.trust_links (least(from_id, to_id), greatest(from_id, to_id));
alter table public.trust_links enable row level security;
create policy trust_links_select on public.trust_links for select to authenticated using (auth.uid() in (from_id, to_id));
create policy trust_links_no_delete on public.trust_links as restrictive for delete using (false);

-- Lo que cada uno comparte con cada persona: owner comparte con other.
create table if not exists public.trust_perms (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  other_id uuid not null references public.profiles (id) on delete cascade,
  vuelvo boolean not null default true,   -- puede seguir mi vuelta a casa
  cuidado boolean not null default true,  -- recibe mi «Necesito ayuda» y ve mi «Estoy bien»
  primary key (owner_id, other_id)
);
alter table public.trust_perms enable row level security;
create policy trust_perms_select on public.trust_perms for select to authenticated using (auth.uid() in (owner_id, other_id));

create table if not exists public.invite_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
create policy invite_codes_self on public.invite_codes for select to authenticated using (user_id = auth.uid());

create or replace function public.is_trusted(p_owner uuid, p_viewer uuid, p_what text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trust_links l join trust_perms p on p.owner_id = p_owner and p.other_id = p_viewer
    where l.status = 'aceptada' and least(l.from_id, l.to_id) = least(p_owner, p_viewer) and greatest(l.from_id, l.to_id) = greatest(p_owner, p_viewer)
      and case p_what when 'vuelvo' then p.vuelvo when 'cuidado' then p.cuidado else false end
      and not is_blocked(p_owner, p_viewer)
  );
$$;

create or replace function public.my_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text; abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if not is_fase2(auth.uid()) then raise exception 'Mi gente todavía no está abierta en tu barrio'; end if;
  select code into c from invite_codes where user_id = auth.uid();
  if c is not null then return c; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    begin
      insert into invite_codes (user_id, code) values (auth.uid(), c);
      return c;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

create or replace function public.invite_person(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare l trust_links%rowtype; lid uuid; quien text;
begin
  if not is_fase2(auth.uid()) then raise exception 'Mi gente todavía no está abierta en tu barrio'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'No puedes añadirte a ti mismo'; end if;
  if not is_fase2(p_user) then raise exception 'Esa persona todavía no puede usar Mi gente'; end if;
  if is_blocked(auth.uid(), p_user) then raise exception 'No puedes añadir a esta persona'; end if;
  if (select count(*) from trust_links where status in ('pendiente', 'aceptada') and auth.uid() in (from_id, to_id)) >= 30 then
    raise exception 'Mi gente admite hasta 30 personas';
  end if;
  select * into l from trust_links where least(from_id, to_id) = least(auth.uid(), p_user) and greatest(from_id, to_id) = greatest(auth.uid(), p_user);
  if found then
    if l.status = 'aceptada' then raise exception 'Ya está en tu gente'; end if;
    if l.status = 'pendiente' then raise exception 'Ya hay una invitación pendiente'; end if;
    update trust_links set from_id = auth.uid(), to_id = p_user, status = 'pendiente', created_at = now(), answered_at = null where id = l.id returning id into lid;
  else
    insert into trust_links (from_id, to_id) values (auth.uid(), p_user) returning id into lid;
  end if;
  select display_name into quien from profiles where id = auth.uid();
  perform notify(p_user, 'sistema', quien || ' quiere añadirte a su gente', 'Si aceptas, podréis avisaros al volver a casa o si alguien necesita ayuda.');
  return lid;
end $$;

create or replace function public.invite_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from invite_codes where code = upper(trim(p_code));
  if uid is null then raise exception 'Ese código no existe. Revisa las letras.'; end if;
  return invite_person(uid);
end $$;

create or replace function public.answer_trust(p_link uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare l trust_links%rowtype; quien text;
begin
  select * into l from trust_links where id = p_link for update;
  if not found or l.to_id <> auth.uid() or l.status <> 'pendiente' then raise exception 'No se puede responder a esta invitación'; end if;
  update trust_links set status = case when p_accept then 'aceptada' else 'rechazada' end, answered_at = now() where id = l.id;
  if p_accept then
    insert into trust_perms (owner_id, other_id) values (l.from_id, l.to_id), (l.to_id, l.from_id)
      on conflict (owner_id, other_id) do update set vuelvo = true, cuidado = true;
    select display_name into quien from profiles where id = auth.uid();
    perform notify(l.from_id, 'sistema', quien || ' ya está en tu gente', 'Puedes elegir qué compartes con cada persona.');
  end if;
end $$;

create or replace function public.remove_trust(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update trust_links set status = 'retirada', answered_at = now()
    where least(from_id, to_id) = least(auth.uid(), p_user) and greatest(from_id, to_id) = greatest(auth.uid(), p_user)
      and status in ('pendiente', 'aceptada');
  update trust_perms set vuelvo = false, cuidado = false
    where (owner_id = auth.uid() and other_id = p_user) or (owner_id = p_user and other_id = auth.uid());
end $$;

create or replace function public.set_trust_perm(p_user uuid, p_vuelvo boolean, p_cuidado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trust_links where status = 'aceptada'
    and least(from_id, to_id) = least(auth.uid(), p_user) and greatest(from_id, to_id) = greatest(auth.uid(), p_user)) then
    raise exception 'Esa persona no está en tu gente';
  end if;
  update trust_perms set vuelvo = coalesce(p_vuelvo, vuelvo), cuidado = coalesce(p_cuidado, cuidado)
    where owner_id = auth.uid() and other_id = p_user;
end $$;

-- ------------------------------------------------------------------
-- Presencia: «Estoy bien» y «Estoy despierto»
-- ------------------------------------------------------------------
create table if not exists public.presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_ok_at timestamptz,
  awake_until timestamptz
);
alter table public.presence enable row level security;
create policy presence_select on public.presence for select to authenticated using (
  user_id = auth.uid() or is_trusted(user_id, auth.uid(), 'cuidado') or is_trusted(user_id, auth.uid(), 'vuelvo')
);

create or replace function public.i_am_ok()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_fase2(auth.uid()) then raise exception 'Todavía no está abierto en tu barrio'; end if;
  insert into presence (user_id, last_ok_at) values (auth.uid(), now())
    on conflict (user_id) do update set last_ok_at = now();
end $$;

create or replace function public.set_awake(p_minutes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_fase2(auth.uid()) then raise exception 'Todavía no está abierto en tu barrio'; end if;
  insert into presence (user_id, awake_until) values (auth.uid(), case when coalesce(p_minutes, 0) > 0 then now() + make_interval(mins => least(p_minutes, 240)) end)
    on conflict (user_id) do update set awake_until = excluded.awake_until;
end $$;

-- ------------------------------------------------------------------
-- Necesito ayuda
-- ------------------------------------------------------------------
create table if not exists public.care_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'abierta' check (status in ('abierta', 'atendida', 'cerrada')),
  responder_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists care_alerts_one_open on public.care_alerts (user_id) where status in ('abierta', 'atendida');
alter table public.care_alerts enable row level security;
create policy care_alerts_select on public.care_alerts for select to authenticated using (
  user_id = auth.uid() or is_trusted(user_id, auth.uid(), 'cuidado')
);
create policy care_alerts_no_delete on public.care_alerts as restrictive for delete using (false);

create table if not exists public.care_responses (
  alert_id uuid not null references public.care_alerts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('voy', 'no_puedo')),
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);
alter table public.care_responses enable row level security;
create policy care_responses_select on public.care_responses for select to authenticated using (
  exists (select 1 from care_alerts a where a.id = alert_id and (a.user_id = auth.uid() or is_trusted(a.user_id, auth.uid(), 'cuidado')))
);

create or replace function public.ask_help()
returns uuid language plpgsql security definer set search_path = public as $$
declare aid uuid; quien text; r record;
begin
  if not is_fase2(auth.uid()) then raise exception 'Todavía no está abierto en tu barrio'; end if;
  select id into aid from care_alerts where user_id = auth.uid() and status in ('abierta', 'atendida');
  if aid is not null then return aid; end if;
  insert into care_alerts (user_id) values (auth.uid()) returning id into aid;
  select display_name into quien from profiles where id = auth.uid();
  for r in select other_id from trust_perms where owner_id = auth.uid() and cuidado loop
    if is_trusted(auth.uid(), r.other_id, 'cuidado') then
      perform notify(r.other_id, 'sistema', quien || ' necesita ayuda ahora', 'Abre Stoop y dile si vas. Si es grave, llama al 112.');
    end if;
  end loop;
  return aid;
end $$;

create or replace function public.respond_help(p_alert uuid, p_going boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a care_alerts%rowtype; quien text;
begin
  select * into a from care_alerts where id = p_alert for update;
  if not found or a.status = 'cerrada' or not is_trusted(a.user_id, auth.uid(), 'cuidado') then raise exception 'Este aviso ya no está abierto'; end if;
  insert into care_responses (alert_id, user_id, answer) values (a.id, auth.uid(), case when p_going then 'voy' else 'no_puedo' end)
    on conflict (alert_id, user_id) do update set answer = excluded.answer, created_at = now();
  if p_going and a.responder_id is null then
    update care_alerts set status = 'atendida', responder_id = auth.uid() where id = a.id;
  end if;
  select display_name into quien from profiles where id = auth.uid();
  if p_going then perform notify(a.user_id, 'sistema', quien || ' va para allá', 'Si es grave, llama al 112.'); end if;
end $$;

create or replace function public.close_help(p_alert uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a care_alerts%rowtype; quien text; r record;
begin
  select * into a from care_alerts where id = p_alert for update;
  if not found or a.status = 'cerrada' then return; end if;
  if a.user_id <> auth.uid() and a.responder_id is distinct from auth.uid() then raise exception 'No puedes cerrar este aviso'; end if;
  update care_alerts set status = 'cerrada', closed_at = now() where id = a.id;
  select display_name into quien from profiles where id = a.user_id;
  for r in select user_id from care_responses where alert_id = a.id and user_id <> auth.uid() loop
    perform notify(r.user_id, 'sistema', 'Todo bien con ' || quien, 'El aviso de ayuda se ha cerrado.');
  end loop;
end $$;

-- ------------------------------------------------------------------
-- Vuelvo a casa: solo la última posición, solo mientras dura, y se borra al llegar.
-- ------------------------------------------------------------------
create table if not exists public.walks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'activa' check (status in ('activa', 'llegado', 'cancelada')),
  eta_at timestamptz not null,
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  pos_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists walks_one_active on public.walks (user_id) where status = 'activa';
alter table public.walks enable row level security;
create policy walks_select on public.walks for select to authenticated using (
  user_id = auth.uid() or (is_trusted(user_id, auth.uid(), 'vuelvo') and (status = 'activa' or ended_at > now() - interval '2 hours'))
);
create policy walks_no_delete on public.walks as restrictive for delete using (false);

create or replace function public.start_walk(p_minutes integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare wid uuid; quien text; r record; m int := greatest(5, least(coalesce(p_minutes, 20), 120));
begin
  if not is_fase2(auth.uid()) then raise exception 'Todavía no está abierto en tu barrio'; end if;
  select id into wid from walks where user_id = auth.uid() and status = 'activa';
  if wid is not null then return wid; end if;
  insert into walks (user_id, eta_at) values (auth.uid(), now() + make_interval(mins => m)) returning id into wid;
  select display_name into quien from profiles where id = auth.uid();
  for r in select other_id from trust_perms where owner_id = auth.uid() and vuelvo loop
    if is_trusted(auth.uid(), r.other_id, 'vuelvo') then
      perform notify(r.other_id, 'sistema', quien || ' vuelve a casa', 'Llega en unos ' || m || ' minutos. Puedes seguirle desde Vecinos, Mi gente.');
    end if;
  end loop;
  return wid;
end $$;

create or replace function public.update_walk(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  update walks set lat = p_lat, lng = p_lng, pos_at = now() where user_id = auth.uid() and status = 'activa';
end $$;

create or replace function public.extend_walk(p_minutes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update walks set eta_at = greatest(eta_at, now()) + make_interval(mins => greatest(5, least(coalesce(p_minutes, 10), 60)))
    where user_id = auth.uid() and status = 'activa';
end $$;

create or replace function public.end_walk(p_arrived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare w walks%rowtype; quien text; r record;
begin
  select * into w from walks where user_id = auth.uid() and status = 'activa' for update;
  if not found then return; end if;
  update walks set status = case when p_arrived then 'llegado' else 'cancelada' end, ended_at = now(), lat = null, lng = null where id = w.id;
  select display_name into quien from profiles where id = auth.uid();
  for r in select other_id from trust_perms where owner_id = auth.uid() and vuelvo loop
    if is_trusted(auth.uid(), r.other_id, 'vuelvo') then
      perform notify(r.other_id, 'sistema', case when p_arrived then quien || ' ha llegado bien' else quien || ' ha dejado de compartir su vuelta' end, null);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------
-- Mi gente en una consulta (nombres solo de quien está en tu círculo o te ha invitado)
-- ------------------------------------------------------------------
create or replace function public.my_people()
returns table (
  link_id uuid, other_id uuid, name text, status text, i_sent boolean, neighbour boolean,
  i_share_vuelvo boolean, i_share_cuidado boolean, they_share_vuelvo boolean, they_share_cuidado boolean,
  awake boolean, last_ok_at timestamptz
) language sql stable security definer set search_path = public as $$
  select l.id, o.id, o.display_name, l.status, l.from_id = auth.uid(), o.verified_at is not null,
    coalesce(mp.vuelvo, false), coalesce(mp.cuidado, false), coalesce(tp.vuelvo, false), coalesce(tp.cuidado, false),
    case when l.status = 'aceptada' and (coalesce(tp.vuelvo, false) or coalesce(tp.cuidado, false)) then coalesce(pr.awake_until > now(), false) else false end,
    case when l.status = 'aceptada' and coalesce(tp.cuidado, false) then pr.last_ok_at end
  from trust_links l
  join profiles o on o.id = case when l.from_id = auth.uid() then l.to_id else l.from_id end
  left join trust_perms mp on mp.owner_id = auth.uid() and mp.other_id = o.id
  left join trust_perms tp on tp.owner_id = o.id and tp.other_id = auth.uid()
  left join presence pr on pr.user_id = o.id
  where auth.uid() in (l.from_id, l.to_id) and l.status in ('pendiente', 'aceptada') and not is_blocked(auth.uid(), o.id)
  order by l.status, o.display_name;
$$;

-- Nombre de quien te pide ayuda o vuelve a casa (para pintar los avisos)
create policy profiles_trust_select on public.profiles for select to authenticated using (
  exists (select 1 from trust_links l where l.status in ('pendiente', 'aceptada')
    and least(l.from_id, l.to_id) = least(auth.uid(), profiles.id) and greatest(l.from_id, l.to_id) = greatest(auth.uid(), profiles.id))
);

alter publication supabase_realtime add table public.walks;
alter publication supabase_realtime add table public.care_alerts;
alter publication supabase_realtime add table public.trust_links;

revoke execute on function public.is_trusted(uuid, uuid, text) from public, anon;
grant execute on function public.is_trusted(uuid, uuid, text) to authenticated;
revoke execute on function public.my_invite_code() from public, anon;
grant execute on function public.my_invite_code() to authenticated;
revoke execute on function public.invite_person(uuid) from public, anon;
grant execute on function public.invite_person(uuid) to authenticated;
revoke execute on function public.invite_by_code(text) from public, anon;
grant execute on function public.invite_by_code(text) to authenticated;
revoke execute on function public.answer_trust(uuid, boolean) from public, anon;
grant execute on function public.answer_trust(uuid, boolean) to authenticated;
revoke execute on function public.remove_trust(uuid) from public, anon;
grant execute on function public.remove_trust(uuid) to authenticated;
revoke execute on function public.set_trust_perm(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_trust_perm(uuid, boolean, boolean) to authenticated;
revoke execute on function public.i_am_ok() from public, anon;
grant execute on function public.i_am_ok() to authenticated;
revoke execute on function public.set_awake(integer) from public, anon;
grant execute on function public.set_awake(integer) to authenticated;
revoke execute on function public.ask_help() from public, anon;
grant execute on function public.ask_help() to authenticated;
revoke execute on function public.respond_help(uuid, boolean) from public, anon;
grant execute on function public.respond_help(uuid, boolean) to authenticated;
revoke execute on function public.close_help(uuid) from public, anon;
grant execute on function public.close_help(uuid) to authenticated;
revoke execute on function public.start_walk(integer) from public, anon;
grant execute on function public.start_walk(integer) to authenticated;
revoke execute on function public.update_walk(double precision, double precision) from public, anon;
grant execute on function public.update_walk(double precision, double precision) to authenticated;
revoke execute on function public.extend_walk(integer) from public, anon;
grant execute on function public.extend_walk(integer) to authenticated;
revoke execute on function public.end_walk(boolean) from public, anon;
grant execute on function public.end_walk(boolean) to authenticated;
revoke execute on function public.my_people() from public, anon;
grant execute on function public.my_people() to authenticated;
