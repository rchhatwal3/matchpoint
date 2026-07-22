-- 007_service_role_grants.sql
-- The get-restaurants edge function runs as the `service_role` (it bypasses RLS
-- to cache places into `items`). On projects created without the default blanket
-- grants, service_role has no table privileges — RLS bypass is not the same as a
-- table GRANT — so its first SELECT on items fails with "permission denied".
-- Grant exactly what the function does: read + write items. (004 covered the
-- `authenticated` role; this covers `service_role`.)

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.items TO service_role;
