begin;

-- PostgREST's service_role cannot read auth.users directly. These server-only
-- functions validate p_actor internally and need the owner's auth access.
alter function public.payment_planning_mutate(uuid,uuid,text,jsonb) security definer;
alter function public.payment_planning_move_item(uuid,uuid,jsonb) security definer;

revoke all on function public.payment_planning_mutate(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.payment_planning_move_item(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.payment_planning_mutate(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.payment_planning_move_item(uuid,uuid,jsonb) to service_role;

commit;
