-- Hablar con tu gente sin pasar por el tablón, y ver en la portada quién de tu gente está conectado o despierto.

alter table public.presence add column if not exists last_seen_at timestamptz;

-- La app lo llama cada minuto mientras está abierta.
create or replace function public.touch_presence()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_fase2(auth.uid()) then return; end if;
  insert into presence (user_id, last_seen_at) values (auth.uid(), now())
    on conflict (user_id) do update set last_seen_at = now();
end $$;

-- Quién de mi gente está conectado (Stoop abierto hace menos de 3 minutos) o despierto.
-- Solo de quien me comparte algo: si alguien me quita los permisos, deja de verse su ventana.
create or replace function public.people_presence()
returns table (other_id uuid, name text, online boolean, awake boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name,
    coalesce(pr.last_seen_at > now() - interval '3 minutes', false),
    coalesce(pr.awake_until > now(), false)
  from trust_links l
  join profiles o on o.id = case when l.from_id = auth.uid() then l.to_id else l.from_id end
  left join presence pr on pr.user_id = o.id
  where l.status = 'aceptada' and auth.uid() in (l.from_id, l.to_id)
    and (is_trusted(o.id, auth.uid(), 'vuelvo') or is_trusted(o.id, auth.uid(), 'cuidado'))
    and not is_blocked(auth.uid(), o.id);
$$;

-- Chat directo con alguien de mi gente: ya os habéis aceptado, así que se abre sin esperar.
create or replace function public.open_direct_chat(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not is_fase2(auth.uid()) then raise exception 'Todavía no está abierto en tu barrio'; end if;
  if is_blocked(auth.uid(), p_user) then raise exception 'No puedes escribir a esta persona'; end if;
  if not exists (select 1 from trust_links where status = 'aceptada'
    and least(from_id, to_id) = least(auth.uid(), p_user) and greatest(from_id, to_id) = greatest(auth.uid(), p_user)) then
    raise exception 'Solo puedes escribir directamente a tu gente';
  end if;
  select id into cid from conversations
    where request_id is null and ((starter_id = auth.uid() and other_id = p_user) or (starter_id = p_user and other_id = auth.uid()))
    order by created_at limit 1;
  if cid is null then
    insert into conversations (starter_id, other_id, status) values (auth.uid(), p_user, 'aceptada') returning id into cid;
  elsif (select status from conversations where id = cid) in ('pendiente', 'rechazada') then
    update conversations set status = 'aceptada' where id = cid;
  end if;
  return cid;
end $$;

revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;
revoke execute on function public.people_presence() from public, anon;
grant execute on function public.people_presence() to authenticated;
revoke execute on function public.open_direct_chat(uuid) from public, anon;
grant execute on function public.open_direct_chat(uuid) to authenticated;
