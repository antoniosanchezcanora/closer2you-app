-- Correcciones tras la revisión del 12/10/2026.

-- 1. El vecino seguía viendo sus reservas, pero sin título, en cuanto la oferta se retiraba o caducaba.
--    Puede ver las ofertas que ha reservado, aunque ya no estén en la calle.
create policy offers_reserved_select on public.offers for select to authenticated using (
  exists (select 1 from public.reservations r where r.offer_id = offers.id and r.neighbour_id = auth.uid())
);

-- 2. Al reservar, la tienda también tiene que estar activa.
-- 3. "No me queda": la tienda rechaza porque no tiene stock, así que la oferta se agota
--    en vez de devolver las unidades (antes volvía a mostrar unidades que no existían).
create or replace function public.tg_reservation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare o offers%rowtype;
begin
  select * into o from offers where id = new.offer_id for update;
  if not found or not o.active or o.until < now()
     or not exists (select 1 from shops s where s.id = o.shop_id and s.active) then
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

    if new.status = 'cancelada' then
      update offers set qty_left = qty_left + old.qty where id = old.offer_id;
    elsif new.status = 'rechazada' then
      update offers set qty_left = 0 where id = old.offer_id;
    end if;

    if new.status = 'recogida' then
      update shops set free_reservations_used = least(free_reservations_used + 1, 10)
        where id = old.shop_id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

revoke execute on function public.tg_reservation_insert() from public, anon, authenticated;
revoke execute on function public.tg_reservation_update() from public, anon, authenticated;
