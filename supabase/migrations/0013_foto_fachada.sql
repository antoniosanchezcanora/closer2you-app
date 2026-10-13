-- La tienda elige su imagen: una foto de su fachada o el dibujo que le hace Stoop.
-- La foto vive en el almacén público "fachadas", en una carpeta con el id de la tienda; solo su dueño puede subirla.

alter table public.shops add column if not exists photo_url text;
alter table public.shops add column if not exists use_photo boolean not null default false;
alter table public.shops add constraint shops_photo_url_own check (
  photo_url is null
  or photo_url like 'https://gupdebihwahrvasqfflz.supabase.co/storage/v1/object/public/fachadas/' || id::text || '/%'
);
alter table public.shops add constraint shops_use_photo_needs_url check (not use_photo or photo_url is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fachadas', 'fachadas', true, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.owns_shop_folder(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare sid uuid;
begin
  begin sid := (storage.foldername(p_name))[1]::uuid; exception when others then return false; end;
  return exists (select 1 from shops where id = sid and owner_id = auth.uid());
end $$;

create policy fachadas_owner_select on storage.objects for select to authenticated using (bucket_id = 'fachadas' and public.owns_shop_folder(name));
create policy fachadas_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'fachadas' and public.owns_shop_folder(name));
create policy fachadas_owner_update on storage.objects for update to authenticated using (bucket_id = 'fachadas' and public.owns_shop_folder(name)) with check (bucket_id = 'fachadas' and public.owns_shop_folder(name));

revoke execute on function public.owns_shop_folder(text) from public, anon;
grant execute on function public.owns_shop_folder(text) to authenticated;
