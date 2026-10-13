-- 0017b Funciones de la verificación con factura o DNI.
create or replace function public.request_id_check(p_method text, p_path text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; r record;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_method not in ('factura', 'dni') then raise exception 'Método no válido'; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'Archivo no válido'; end if;
  if is_verified(auth.uid()) then raise exception 'Ya estás verificado'; end if;
  if exists (select 1 from id_checks where user_id = auth.uid() and status = 'pendiente') then raise exception 'Ya tienes una revisión pendiente'; end if;
  insert into id_checks (user_id, method, path) values (auth.uid(), p_method, p_path) returning id into cid;
  for r in select user_id from stoop_admins loop
    perform notify(r.user_id, 'sistema', 'Verificación pendiente', 'Un vecino ha enviado una ' || case p_method when 'dni' then 'foto del DNI' else 'factura' end || '. Revísala en Perfil.');
  end loop;
  return cid;
end $$;

create or replace function public.my_id_check()
returns table (id uuid, method text, status text, reason text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.method, c.status, c.reason, c.created_at from id_checks c
  where c.user_id = auth.uid() order by c.created_at desc limit 1;
$$;

-- El vecino retira su petición; la app borra la foto a continuación.
create or replace function public.cancel_id_check(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text;
begin
  update id_checks set status = 'retirada', reviewed_at = now() where id = p_id and user_id = auth.uid() and status = 'pendiente' returning path into p;
  if p is null then raise exception 'No hay nada que retirar'; end if;
  return p;
end $$;

create or replace function public.pending_id_checks()
returns table (id uuid, user_id uuid, name text, method text, path text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Solo el equipo de Stoop'; end if;
  return query select c.id, c.user_id, p.display_name, c.method, c.path, c.created_at
    from id_checks c join profiles p on p.id = c.user_id where c.status = 'pendiente' order by c.created_at;
end $$;

-- Aprobar o rechazar. Devuelve la ruta de la foto para que la app del revisor la borre.
create or replace function public.review_id_check(p_id uuid, p_approve boolean, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare c id_checks%rowtype;
begin
  if not is_admin(auth.uid()) then raise exception 'Solo el equipo de Stoop'; end if;
  select * into c from id_checks where id = p_id and status = 'pendiente' for update;
  if not found then raise exception 'Esa revisión ya no está pendiente'; end if;
  update id_checks set status = case when p_approve then 'aprobada' else 'rechazada' end,
    reason = case when p_approve then null else left(nullif(trim(p_reason), ''), 200) end,
    reviewed_at = now(), reviewed_by = auth.uid() where id = c.id;
  if p_approve then
    update profiles set verified_at = now(), verify_method = c.method where id = c.user_id and verified_at is null;
    perform notify(c.user_id, 'verificado', 'Ya estás verificado', 'Hemos comprobado tu ' || case c.method when 'dni' then 'DNI' else 'factura' end || ' y hemos borrado la foto.');
  else
    perform notify(c.user_id, 'verificado', 'No hemos podido verificarte', coalesce(left(nullif(trim(p_reason), ''), 150), 'La foto no servía.') || ' Hemos borrado la foto.');
  end if;
  return c.path;
end $$;

create or replace function public.mark_id_file_removed(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update id_checks set file_removed_at = now() where id = p_id and file_removed_at is null
    and (is_admin(auth.uid()) or (user_id = auth.uid() and status = 'retirada'));
end $$;

revoke execute on function public.request_id_check(text, text) from public, anon;
grant execute on function public.request_id_check(text, text) to authenticated;
revoke execute on function public.my_id_check() from public, anon;
grant execute on function public.my_id_check() to authenticated;
revoke execute on function public.cancel_id_check(uuid) from public, anon;
grant execute on function public.cancel_id_check(uuid) to authenticated;
revoke execute on function public.pending_id_checks() from public, anon;
grant execute on function public.pending_id_checks() to authenticated;
revoke execute on function public.review_id_check(uuid, boolean, text) from public, anon;
grant execute on function public.review_id_check(uuid, boolean, text) to authenticated;
revoke execute on function public.mark_id_file_removed(uuid) from public, anon;
grant execute on function public.mark_id_file_removed(uuid) to authenticated;
-- El equipo de Stoop se da de alta a mano en stoop_admins (no en una migración).
