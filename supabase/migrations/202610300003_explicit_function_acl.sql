-- Supabase default privileges can grant anon EXECUTE when a function is created.
revoke all on function public.pnu_dashboard(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.pnu_dashboard(timestamptz,timestamptz,text) to authenticated;
