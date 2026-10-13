-- 0016 Aviso discreto (fase 2, solo en pruebas hasta la revisión legal).
-- Una persona elige como mucho a dos personas de su gente que no vivan con ella.
-- Si mantiene pulsado «Estoy bien», les llega un aviso con su ubicación.
-- En su propio teléfono no queda nada: ni aviso, ni historial; su cuenta ni siquiera puede leer esos avisos.
-- Sin audio: grabar a escondidas tiene riesgo penal (art. 197 CP) y el indicador de micrófono lo delataría.

create table if not exists public.discreet_contacts (
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);
alter table public.discreet_contacts enable row level security;
create policy discreet_contacts_select on public.discreet_contacts for select to authenticated
  using (removed_at is null and (owner_id = auth.uid() or contact_id = auth.uid()));

create table if not exists public.discreet_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now()
);
create index if not exists discreet_alerts_owner_idx on public.discreet_alerts (owner_id, created_at desc);
alter table public.discreet_alerts enable row level security;

create table if not exists public.discreet_recipients (
  alert_id uuid not null references public.discreet_alerts (id) on delete cascade,
  contact_id uuid not null references auth.users (id) on delete cascade,
  called_at timestamptz,
  primary key (alert_id, contact_id)
);
alter table public.discreet_recipients enable row level security;
create policy discreet_recipients_select on public.discreet_recipients for select to authenticated using (contact_id = auth.uid());
-- Quien envía el aviso no tiene ninguna política sobre discreet_alerts: no lo puede leer.
create policy discreet_alerts_select on public.discreet_alerts for select to authenticated
  using (exists (select 1 from discreet_recipients r where r.alert_id = id and r.contact_id = auth.uid()));

create or replace function public.linked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trust_links l where l.status = 'aceptada'
    and least(l.from_id, l.to_id) = least(p_a, p_b) and greatest(l.from_id, l.to_id) = greatest(p_a, p_b))
    and not is_blocked(p_a, p_b);
$$;

-- Elegir (o vaciar) las personas para emergencias. Máximo dos, de tu gente.
create or replace function public.set_discreet_contacts(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare c uuid; quien text; ids uuid[] := coalesce(p_ids, '{}');
begin
  if not is_fase2(auth.uid()) then raise exception 'Todavía no está abierto en tu barrio'; end if;
  ids := array(select distinct x from unnest(ids) x);
  if cardinality(ids) > 2 then raise exception 'Elige como mucho a dos personas'; end if;
  foreach c in array ids loop
    if c = auth.uid() or not linked(auth.uid(), c) then raise exception 'Solo puedes elegir a personas de tu gente'; end if;
  end loop;
  update discreet_contacts set removed_at = now() where owner_id = auth.uid() and removed_at is null and not (contact_id = any (ids));
  select display_name into quien from profiles where id = auth.uid();
  foreach c in array ids loop
    if not exists (select 1 from discreet_contacts where owner_id = auth.uid() and contact_id = c and removed_at is null) then
      insert into discreet_contacts (owner_id, contact_id) values (auth.uid(), c)
        on conflict (owner_id, contact_id) do update set removed_at = null, created_at = now();
      perform notify(c, 'sistema', quien || ' te ha elegido para una emergencia',
        'Si te llega un aviso suyo, llama al 112 y no vayas sola a la puerta. Lo verás en Vecinos, Mi gente.');
    end if;
  end loop;
end $$;

create or replace function public.my_discreet_contacts()
returns table (contact_id uuid, name text) language sql stable security definer set search_path = public as $$
  select d.contact_id, p.display_name from discreet_contacts d join profiles p on p.id = d.contact_id
  where d.owner_id = auth.uid() and d.removed_at is null order by d.created_at;
$$;

-- Quién me ha elegido a mí (para saberlo y poder salirme).
create or replace function public.discreet_for_me()
returns table (owner_id uuid, name text) language sql stable security definer set search_path = public as $$
  select d.owner_id, p.display_name from discreet_contacts d join profiles p on p.id = d.owner_id
  where d.contact_id = auth.uid() and d.removed_at is null order by d.created_at;
$$;

create or replace function public.leave_discreet(p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update discreet_contacts set removed_at = now() where owner_id = p_owner and contact_id = auth.uid() and removed_at is null;
  -- Texto neutro a propósito: el aviso lo puede leer otra persona con su móvil.
  if found then perform notify(p_owner, 'sistema', 'Revisa tus personas para emergencias', 'Ha cambiado tu lista. Entra en Perfil para revisarla.'); end if;
end $$;

-- El aviso. No devuelve nada que permita distinguirlo de un «Estoy bien» en la pantalla de quien lo envía.
create or replace function public.send_discreet(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare aid uuid; quien text; r record;
begin
  if not is_fase2(auth.uid()) then return; end if;
  -- Si se pulsa dos veces seguidas no duplicamos el aviso.
  if exists (select 1 from discreet_alerts where owner_id = auth.uid() and created_at > now() - interval '2 minutes') then return; end if;
  if not exists (select 1 from discreet_contacts d where d.owner_id = auth.uid() and d.removed_at is null and linked(auth.uid(), d.contact_id)) then return; end if;
  insert into discreet_alerts (owner_id, lat, lng) values (auth.uid(), p_lat, p_lng) returning id into aid;
  select display_name into quien from profiles where id = auth.uid();
  for r in select contact_id from discreet_contacts where owner_id = auth.uid() and removed_at is null loop
    if linked(auth.uid(), r.contact_id) then
      insert into discreet_recipients (alert_id, contact_id) values (aid, r.contact_id);
      perform notify(r.contact_id, 'sistema', quien || ' necesita ayuda en casa',
        'Llama al 112. No vayas sola a la puerta. Abre Stoop para ver dónde está.');
    end if;
  end loop;
end $$;

-- Lo que ve quien recibe avisos: los de las últimas 24 horas.
create or replace function public.discreet_inbox()
returns table (id uuid, owner_id uuid, name text, lat double precision, lng double precision, created_at timestamptz, called_at timestamptz, others_called text)
language sql stable security definer set search_path = public as $$
  select a.id, a.owner_id, p.display_name, a.lat, a.lng, a.created_at, r.called_at,
    (select string_agg(pp.display_name, ', ') from discreet_recipients o join profiles pp on pp.id = o.contact_id
      where o.alert_id = a.id and o.contact_id <> auth.uid() and o.called_at is not null)
  from discreet_recipients r join discreet_alerts a on a.id = r.alert_id join profiles p on p.id = a.owner_id
  where r.contact_id = auth.uid() and a.created_at > now() - interval '24 hours'
  order by a.created_at desc;
$$;

create or replace function public.mark_discreet_called(p_alert uuid)
returns void language plpgsql security definer set search_path = public as $$
declare quien text; dueno text; r record;
begin
  update discreet_recipients set called_at = coalesce(called_at, now()) where alert_id = p_alert and contact_id = auth.uid();
  if not found then raise exception 'Ese aviso no es para ti'; end if;
  select display_name into quien from profiles where id = auth.uid();
  select p.display_name into dueno from discreet_alerts a join profiles p on p.id = a.owner_id where a.id = p_alert;
  for r in select contact_id from discreet_recipients where alert_id = p_alert and contact_id <> auth.uid() loop
    perform notify(r.contact_id, 'sistema', quien || ' ha llamado al 112', 'Por el aviso de ' || dueno || '.');
  end loop;
end $$;

alter publication supabase_realtime add table public.discreet_recipients;

revoke execute on function public.linked(uuid, uuid) from public, anon;
grant execute on function public.linked(uuid, uuid) to authenticated;
revoke execute on function public.set_discreet_contacts(uuid[]) from public, anon;
grant execute on function public.set_discreet_contacts(uuid[]) to authenticated;
revoke execute on function public.my_discreet_contacts() from public, anon;
grant execute on function public.my_discreet_contacts() to authenticated;
revoke execute on function public.discreet_for_me() from public, anon;
grant execute on function public.discreet_for_me() to authenticated;
revoke execute on function public.leave_discreet(uuid) from public, anon;
grant execute on function public.leave_discreet(uuid) to authenticated;
revoke execute on function public.send_discreet(double precision, double precision) from public, anon;
grant execute on function public.send_discreet(double precision, double precision) to authenticated;
revoke execute on function public.discreet_inbox() from public, anon;
grant execute on function public.discreet_inbox() to authenticated;
revoke execute on function public.mark_discreet_called(uuid) from public, anon;
grant execute on function public.mark_discreet_called(uuid) to authenticated;
