-- 005_realtime.sql
-- New Supabase projects create the supabase_realtime publication empty;
-- postgres_changes subscriptions silently receive nothing until tables are
-- added. RLS still applies to delivered rows (subscribers only receive rows
-- their role can select).

ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.swipes;
