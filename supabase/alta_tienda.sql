-- Alta de una tienda tras la visita en persona.
-- 1. El tendero se registra en la app con su correo (pantalla de entrada).
-- 2. Ejecuta esto en Supabase > SQL Editor cambiando los datos.
-- Se ejecuta con permisos de administrador; desde la app nadie puede crear ni activar tiendas.

insert into public.shops (owner_id, name, category, street, hours, active)
select id, 'Frutería Lacy', 'fruteria', 'General Lacy', 'Hasta las 20:30', true
from auth.users
where email = 'correo-del-tendero@ejemplo.com';

-- El tendero cuenta como vecino verificado (lo hemos visto en persona).
update public.profiles
set verified_at = now(), verify_method = 'tienda'
where id = (select id from auth.users where email = 'correo-del-tendero@ejemplo.com');
