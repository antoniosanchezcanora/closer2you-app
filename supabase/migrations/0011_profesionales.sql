-- Stoop Fase 2: profesionales del barrio. Solo autónomos verificados en persona por Stoop.
-- Stoop no cobra nada en la app: la cita se acuerda y se paga en persona.
-- Reglas que se comprueban en la base de datos antes de marcar a alguien como verificado:
--   * Alta en el RETA (autónomos) siempre.
--   * Fisioterapia: colegiación y seguro de responsabilidad civil (Ley 44/2003, art. 46).
--   * Trabajo con menores: certificado negativo de delitos sexuales (LO 8/2021, LOPIVI, art. 57).

create table if not exists public.pros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('fisio', 'clases', 'cuidados', 'reparaciones', 'otro')),
  title text not null check (char_length(title) between 3 and 60),
  about text check (about is null or char_length(about) <= 400),
  price_text text check (price_text is null or char_length(price_text) <= 60),
  colegiado text check (colegiado is null or char_length(colegiado) <= 40),
  seguro_rc boolean not null default false,
  reta boolean not null default false,
  with_minors boolean not null default false,
  cert_menores boolean not null default false,
  status text not null default 'solicitada' check (status in ('solicitada', 'verificada', 'rechazada', 'pausada')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pros_requisitos check (
    status not in ('verificada', 'pausada') or (
      reta
      and (kind <> 'fisio' or (colegiado is not null and seguro_rc))
      and (not with_minors or cert_menores)
    )
  )
);
alter table public.pros enable row level security;
create policy pros_select on public.pros for select to authenticated using (
  user_id = auth.uid() or (status = 'verificada' and is_fase2(auth.uid()))
);
create policy pros_insert on public.pros for insert to authenticated with check (user_id = auth.uid() and is_fase2(auth.uid()) and status = 'solicitada' and verified_at is null);
create policy pros_owner_update on public.pros for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pros_no_delete on public.pros as restrictive for delete using (false);

-- El profesional solo puede pausar o reanudar. Si cambia lo declarado, vuelve a revisión.
create or replace function public.tg_pros_protect()
returns trigger language plpgsql set search_path = public as $$  -- sin security definer: current_user es quien llama
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.user_id := old.user_id;
  new.verified_at := old.verified_at;
  if new.status is distinct from old.status
     and not (old.status = 'verificada' and new.status = 'pausada')
     and not (old.status = 'pausada' and new.status = 'verificada') then
    new.status := old.status;
  end if;
  if (new.kind, new.colegiado, new.seguro_rc, new.reta, new.with_minors, new.cert_menores)
     is distinct from (old.kind, old.colegiado, old.seguro_rc, old.reta, old.with_minors, old.cert_menores)
     and old.status in ('verificada', 'pausada') then
    new.status := 'solicitada';
  end if;
  return new;
end $$;
create trigger pros_protect before update on public.pros for each row execute function public.tg_pros_protect();

-- Ficha interna de la visita de Stoop: ningún usuario la ve.
create table if not exists public.pro_visits (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pros (id) on delete cascade,
  visited_at timestamptz not null default now(),
  checked_dni boolean not null default false,
  checked_reta boolean not null default false,
  checked_colegio boolean not null default false,
  checked_seguro boolean not null default false,
  checked_cert_menores boolean not null default false,
  notes text,
  result text not null check (result in ('verificada', 'rechazada', 'pendiente_papeles'))
);
alter table public.pro_visits enable row level security;

-- Citas: el vecino la pide, el profesional acepta, y al terminar la marca como hecha.
create table if not exists public.pro_appointments (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pros (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  when_text text not null check (char_length(when_text) between 2 and 60),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada', 'hecha', 'cancelada')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.pro_appointments enable row level security;

create or replace function public.owns_pro(p_pro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pros where id = p_pro and user_id = auth.uid());
$$;

create policy pro_appt_select on public.pro_appointments for select to authenticated using (client_id = auth.uid() or owns_pro(pro_id));
create policy pro_appt_insert on public.pro_appointments for insert to authenticated with check (
  client_id = auth.uid() and status = 'pendiente' and done_at is null and is_fase2(auth.uid())
  and exists (select 1 from pros p where p.id = pro_id and p.status = 'verificada' and p.user_id <> auth.uid())
);
create policy pro_appt_no_delete on public.pro_appointments as restrictive for delete using (false);

create or replace function public.tg_pro_appt_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare pro pros%rowtype; quien text;
begin
  select * into pro from pros where id = new.pro_id;
  select display_name into quien from profiles where id = new.client_id;
  perform notify(pro.user_id, 'sistema', quien || ' te pide una cita', new.when_text);
  return new;
end $$;
create trigger pro_appt_notify after insert on public.pro_appointments for each row execute function public.tg_pro_appt_notify();

create or replace function public.set_appointment(p_appt uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare a pro_appointments%rowtype; pro pros%rowtype; is_pro boolean; quien text;
begin
  select * into a from pro_appointments where id = p_appt for update;
  if not found then raise exception 'Cita no encontrada'; end if;
  select * into pro from pros where id = a.pro_id;
  is_pro := pro.user_id = auth.uid();
  if not is_pro and a.client_id <> auth.uid() then raise exception 'No es tu cita'; end if;
  if p_status in ('aceptada', 'rechazada') and not (is_pro and a.status = 'pendiente') then raise exception 'Solo el profesional responde a una cita pendiente'; end if;
  if p_status = 'hecha' and not (is_pro and a.status = 'aceptada') then raise exception 'Solo el profesional marca como hecha una cita aceptada'; end if;
  if p_status = 'cancelada' and a.status not in ('pendiente', 'aceptada') then raise exception 'Esta cita ya no se puede cancelar'; end if;
  if p_status not in ('aceptada', 'rechazada', 'hecha', 'cancelada') then raise exception 'Estado no válido'; end if;
  update pro_appointments set status = p_status, done_at = case when p_status = 'hecha' then now() else done_at end where id = a.id;
  select display_name into quien from profiles where id = auth.uid();
  perform notify(case when is_pro then a.client_id else pro.user_id end, 'sistema',
    case p_status when 'aceptada' then pro.title || ': cita aceptada'
                  when 'rechazada' then pro.title || ' no puede esa vez'
                  when 'hecha' then '¿Qué tal con ' || pro.title || '?'
                  else quien || ' ha cancelado la cita' end,
    case when p_status = 'hecha' then 'Puedes dejar una reseña: solo opinan quienes tuvieron cita.' else a.when_text end);
end $$;

-- Reseñas: una por cita hecha, solo de quien la tuvo.
create table if not exists public.pro_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.pro_appointments (id) on delete cascade,
  pro_id uuid not null references public.pros (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  body text check (body is null or char_length(body) <= 400),
  created_at timestamptz not null default now()
);
alter table public.pro_reviews enable row level security;
create policy pro_reviews_select on public.pro_reviews for select to authenticated using (is_fase2(auth.uid()) or owns_pro(pro_id));
create policy pro_reviews_insert on public.pro_reviews for insert to authenticated with check (
  author_id = auth.uid() and exists (
    select 1 from pro_appointments a where a.id = appointment_id and a.client_id = auth.uid() and a.status = 'hecha' and a.pro_id = pro_reviews.pro_id
  )
);
create policy pro_reviews_no_delete on public.pro_reviews as restrictive for delete using (false);

-- Nombres de autores de reseñas y de clientes para el profesional
create policy profiles_pro_client_select on public.profiles for select to authenticated using (
  exists (select 1 from pro_appointments a join pros p on p.id = a.pro_id where a.client_id = profiles.id and p.user_id = auth.uid())
);

create or replace function public.pro_summary()
returns table (pro_id uuid, reviews integer, avg_stars numeric, done integer)
language sql stable security definer set search_path = public as $$
  select p.id,
    (select count(*)::int from pro_reviews r where r.pro_id = p.id),
    (select round(avg(stars)::numeric, 1) from pro_reviews r where r.pro_id = p.id),
    (select count(*)::int from pro_appointments a where a.pro_id = p.id and a.status = 'hecha')
  from pros p where p.status = 'verificada' and is_fase2(auth.uid());
$$;

alter publication supabase_realtime add table public.pro_appointments;

revoke execute on function public.tg_pro_appt_notify() from public, anon, authenticated;
revoke execute on function public.owns_pro(uuid) from public, anon;
grant execute on function public.owns_pro(uuid) to authenticated;
revoke execute on function public.set_appointment(uuid, text) from public, anon;
grant execute on function public.set_appointment(uuid, text) to authenticated;
revoke execute on function public.pro_summary() from public, anon;
grant execute on function public.pro_summary() to authenticated;
