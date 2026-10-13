-- Stoop Fase 2 (solo cuentas con fase2): Pide y ofrece, chat con aceptación, bloquear, denunciar y banco de tiempo.
-- Los favores no se cobran. El nivel sube ayudando, nunca pagando.

create or replace function public.is_fase2(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and fase2 and verified_at is not null);
$$;

-- ------------------------------------------------------------------
-- Peticiones y ofrecimientos
-- ------------------------------------------------------------------
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('pido', 'ofrezco')),
  category text not null check (category in ('compra', 'recado', 'prestamo', 'compania', 'otro')),
  title text not null check (char_length(title) between 3 and 140),
  details text check (details is null or char_length(details) <= 300),
  when_text text check (when_text is null or char_length(when_text) <= 40),
  status text not null default 'abierta' check (status in ('abierta', 'resuelta', 'cerrada')),
  created_at timestamptz not null default now()
);
create index if not exists requests_open_idx on public.requests (status, created_at desc);
alter table public.requests enable row level security;

-- Bloqueos: quien bloquea deja de ver al otro y el otro no puede escribirle.
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
create policy blocks_self_all on public.blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create policy requests_select on public.requests for select to authenticated using (
  author_id = auth.uid() or (status = 'abierta' and is_fase2(auth.uid()) and not is_blocked(auth.uid(), author_id))
);
create policy requests_insert on public.requests for insert to authenticated with check (author_id = auth.uid() and is_fase2(auth.uid()) and status = 'abierta');
create policy requests_author_update on public.requests for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy requests_no_delete on public.requests as restrictive for delete using (false);

-- Nombre visible de los autores para quien está en la Fase 2 (solo el nombre: nunca dirección).
create policy profiles_fase2_select on public.profiles for select to authenticated using (
  is_fase2(auth.uid()) and fase2 and verified_at is not null
);

-- ------------------------------------------------------------------
-- Conversaciones: se abren con «Puedo ayudar» y el otro tiene que aceptar
-- ------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.requests (id) on delete set null,
  starter_id uuid not null references public.profiles (id) on delete cascade,
  other_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada', 'bloqueada')),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  check (starter_id <> other_id)
);
create unique index if not exists conversations_pair_req on public.conversations (starter_id, other_id, coalesce(request_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.conversations enable row level security;
create policy conversations_select on public.conversations for select to authenticated using (auth.uid() in (starter_id, other_id));
create policy conversations_no_delete on public.conversations as restrictive for delete using (false);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);
alter table public.messages enable row level security;

create or replace function public.in_conversation(cid uuid, uid uuid, need_accepted boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c where c.id = cid and uid in (c.starter_id, c.other_id)
    and (not need_accepted or c.status = 'aceptada') and not is_blocked(c.starter_id, c.other_id));
$$;

create policy messages_select on public.messages for select to authenticated using (in_conversation(conversation_id, auth.uid(), false));
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and is_fase2(auth.uid()) and in_conversation(conversation_id, auth.uid(), true)
);
create policy messages_no_delete on public.messages as restrictive for delete using (false);

create or replace function public.tg_message_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; dest uuid; quien text;
begin
  select * into c from conversations where id = new.conversation_id;
  update conversations set last_at = new.created_at where id = c.id;
  dest := case when new.sender_id = c.starter_id then c.other_id else c.starter_id end;
  select display_name into quien from profiles where id = new.sender_id;
  perform notify(dest, 'sistema', 'Mensaje de ' || quien, left(new.body, 120));
  return new;
end $$;
create trigger message_after after insert on public.messages for each row execute function public.tg_message_after();

-- «Puedo ayudar» / «Me interesa»: abre la conversación pendiente con un primer mensaje.
create or replace function public.offer_help(p_request uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r requests%rowtype; cid uuid; quien text;
begin
  if not is_fase2(auth.uid()) then raise exception 'Esta función todavía no está abierta en tu barrio'; end if;
  select * into r from requests where id = p_request;
  if not found or r.status <> 'abierta' then raise exception 'Esta petición ya no está abierta'; end if;
  if r.author_id = auth.uid() then raise exception 'Es tu propia petición'; end if;
  if is_blocked(auth.uid(), r.author_id) then raise exception 'No puedes escribir a esta persona'; end if;
  select id into cid from conversations where starter_id = auth.uid() and other_id = r.author_id and request_id = r.id;
  if cid is null then
    insert into conversations (request_id, starter_id, other_id) values (r.id, auth.uid(), r.author_id) returning id into cid;
    insert into messages (conversation_id, sender_id, body)
      values (cid, auth.uid(), left(coalesce(nullif(trim(p_message), ''), case when r.kind = 'pido' then 'Puedo ayudarte.' else 'Me interesa.' end), 500));
    select display_name into quien from profiles where id = auth.uid();
    perform notify(r.author_id, 'sistema', quien || (case when r.kind = 'pido' then ' puede ayudarte' else ' está interesado' end), r.title);
  end if;
  return cid;
end $$;

create or replace function public.answer_conversation(p_conversation uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; quien text;
begin
  select * into c from conversations where id = p_conversation;
  if not found or c.other_id <> auth.uid() or c.status <> 'pendiente' then raise exception 'No se puede responder a esta conversación'; end if;
  update conversations set status = case when p_accept then 'aceptada' else 'rechazada' end where id = c.id;
  if p_accept then
    select display_name into quien from profiles where id = auth.uid();
    perform notify(c.starter_id, 'sistema', quien || ' ha aceptado', 'Ya podéis escribiros.');
  end if;
end $$;

create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user = auth.uid() then raise exception 'No se puede'; end if;
  insert into blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  update conversations set status = 'bloqueada'
    where (starter_id = auth.uid() and other_id = p_user) or (starter_id = p_user and other_id = auth.uid());
end $$;

-- ------------------------------------------------------------------
-- Denuncias (las revisa el equipo de Stoop)
-- ------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  request_id uuid references public.requests (id) on delete set null,
  reason text not null check (reason in ('acoso', 'estafa', 'cobro', 'inapropiado', 'otro')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'pendiente' check (status in ('pendiente', 'revisada')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and reporter_id <> reported_id);
create policy reports_self_select on public.reports for select to authenticated using (reporter_id = auth.uid());

-- ------------------------------------------------------------------
-- Banco de tiempo: quien recibió la ayuda marca la petición como resuelta y dice con quién y cuánto.
-- ------------------------------------------------------------------
create table if not exists public.favors (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests (id) on delete cascade,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  hours numeric(3,1) not null check (hours between 0.5 and 8),
  created_at timestamptz not null default now(),
  check (helper_id <> receiver_id)
);
alter table public.favors enable row level security;
create policy favors_self_select on public.favors for select to authenticated using (auth.uid() in (helper_id, receiver_id));

create or replace function public.resolve_request(p_request uuid, p_helper uuid, p_hours numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r requests%rowtype; helper uuid; receiver uuid; quien text;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.author_id <> auth.uid() or r.status <> 'abierta' then raise exception 'No se puede cerrar esta petición'; end if;
  if p_helper is not null then
    -- Solo con alguien con quien se ha hablado de esta petición y ha sido aceptado.
    if not exists (select 1 from conversations c where c.request_id = r.id and c.status = 'aceptada' and p_helper in (c.starter_id, c.other_id)) then
      raise exception 'Elige a alguien que te haya ayudado a través de Stoop';
    end if;
    -- En «pido», ayuda quien respondió; en «ofrezco», ayuda el autor.
    helper := case when r.kind = 'pido' then p_helper else r.author_id end;
    receiver := case when r.kind = 'pido' then r.author_id else p_helper end;
    insert into favors (request_id, helper_id, receiver_id, hours) values (r.id, helper, receiver, greatest(0.5, least(8, coalesce(p_hours, 1))));
    select display_name into quien from profiles where id = auth.uid();
    perform notify(p_helper, 'sistema', '¡Gracias de ' || quien || '!', 'Suma ' || coalesce(p_hours, 1) || ' h a tu banco de tiempo.');
  end if;
  update requests set status = case when p_helper is null then 'cerrada' else 'resuelta' end where id = r.id;
end $$;

-- Mi nivel y mi banco de tiempo
create or replace function public.my_level()
returns table (favors_given integer, hours_given numeric, hours_received numeric, level integer, next_at integer)
language sql stable security definer set search_path = public as $$
  with g as (select count(*)::int n, coalesce(sum(hours), 0) h from favors where helper_id = auth.uid()),
       r as (select coalesce(sum(hours), 0) h from favors where receiver_id = auth.uid())
  select g.n, g.h, r.h, 1 + g.n / 3, (g.n / 3 + 1) * 3 from g, r;
$$;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

revoke execute on function public.tg_message_after() from public, anon, authenticated;
revoke execute on function public.is_fase2(uuid) from public, anon;
grant execute on function public.is_fase2(uuid) to authenticated;
revoke execute on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
revoke execute on function public.in_conversation(uuid, uuid, boolean) from public, anon;
grant execute on function public.in_conversation(uuid, uuid, boolean) to authenticated;
revoke execute on function public.offer_help(uuid, text) from public, anon;
grant execute on function public.offer_help(uuid, text) to authenticated;
revoke execute on function public.answer_conversation(uuid, boolean) from public, anon;
grant execute on function public.answer_conversation(uuid, boolean) to authenticated;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;
revoke execute on function public.resolve_request(uuid, uuid, numeric) from public, anon;
grant execute on function public.resolve_request(uuid, uuid, numeric) to authenticated;
revoke execute on function public.my_level() from public, anon;
grant execute on function public.my_level() to authenticated;
