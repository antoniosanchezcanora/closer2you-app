-- rls_auto_enable es la función del disparador de eventos ensure_rls (activa RLS en tablas nuevas).
-- Sigue funcionando como disparador; solo se quita que se pueda llamar desde la API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
