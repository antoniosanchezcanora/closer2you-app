-- 0017 Verificación con factura o foto del DNI, además del código en tienda.
-- El vecino sube una foto a un almacén PRIVADO. Solo el equipo de Stoop (stoop_admins) puede verla.
-- Al aprobar o rechazar, la app del revisor borra la foto y aquí solo queda «verificado por factura/DNI».
-- Nunca se guarda el número del DNI ni la dirección: solo el método y la fecha.

create table if not exists public.stoop_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.stoop_admins enable row level security;
create policy stoop_admins_self on public.stoop_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from stoop_admins where user_id = p_user);
$$;

create table if not exists public.id_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('factura', 'dni')),
  path text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada', 'retirada')),
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  file_removed_at timestamptz
);
create unique index if not exists id_checks_one_pending on public.id_checks (user_id) where status = 'pendiente';
alter table public.id_checks enable row level security;
create policy id_checks_select on public.id_checks for select to authenticated using (user_id = auth.uid() or is_admin(auth.uid()));

-- Almacén privado: 5 MB, solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verificaciones', 'verificaciones', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Cada vecino sube solo a su carpeta (<su id>/...). Ver: solo el equipo. Borrar: el equipo o el propio vecino.
create policy verif_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'verificaciones' and (storage.foldername(name))[1] = auth.uid()::text);
create policy verif_select_admin on storage.objects for select to authenticated
  using (bucket_id = 'verificaciones' and public.is_admin(auth.uid()));
create policy verif_remove on storage.objects for delete to authenticated
  using (bucket_id = 'verificaciones' and (public.is_admin(auth.uid()) or (storage.foldername(name))[1] = auth.uid()::text));

-- Funciones: ver 0017b_verificacion_funciones.sql (request_id_check, my_id_check, cancel_id_check, pending_id_checks, review_id_check, mark_id_file_removed).
