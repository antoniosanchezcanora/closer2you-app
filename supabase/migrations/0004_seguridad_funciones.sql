-- Endurecimiento tras el asesor de seguridad de Supabase.

-- Las funciones de trigger no se llaman desde la API.
revoke execute on function public.tg_offer_limits() from public, anon, authenticated;
revoke execute on function public.tg_offer_update() from public, anon, authenticated;
revoke execute on function public.tg_shop_protect() from public, anon, authenticated;
revoke execute on function public.tg_profile_protect() from public, anon, authenticated;
revoke execute on function public.tg_reservation_insert() from public, anon, authenticated;
revoke execute on function public.tg_reservation_update() from public, anon, authenticated;

-- Las que usa la app (o las políticas), solo para usuarios con sesión.
revoke execute on function public.request_shop_code() from public, anon;
revoke execute on function public.confirm_neighbour(text) from public, anon;
revoke execute on function public.is_verified(uuid) from public, anon;
revoke execute on function public.owns_shop(uuid) from public, anon;
grant execute on function public.request_shop_code() to authenticated;
grant execute on function public.confirm_neighbour(text) to authenticated;
grant execute on function public.is_verified(uuid) to authenticated;
grant execute on function public.owns_shop(uuid) to authenticated;

-- search_path fijo
alter function public.tg_offer_update() set search_path = public;
alter function public.tg_shop_protect() set search_path = public;
alter function public.tg_profile_protect() set search_path = public;
