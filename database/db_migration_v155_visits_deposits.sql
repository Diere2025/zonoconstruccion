alter table public.visit_cases add column if not exists deposit_amount numeric(15,2) not null default 0 check(deposit_amount>=0);
do $$ declare definition text; begin
 select pg_get_functiondef('public.visits_command(text,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
 if position('-- v155 deposit' in definition)=0 then
  definition:=replace(definition,'update public.visit_cases set payment_amount=payment_amount+(p_data->>''amount'')::numeric where id=t.id;', $patch$
  -- v155 deposit
  if coalesce(p_data->>'payment_kind','visit') not in ('visit','deposit') then raise exception 'VISITS_INVALID';end if;
  update public.visit_cases set payment_amount=payment_amount+case when coalesce(p_data->>'payment_kind','visit')='visit' then (p_data->>'amount')::numeric else 0 end,
    deposit_amount=deposit_amount+case when p_data->>'payment_kind'='deposit' then (p_data->>'amount')::numeric else 0 end where id=t.id;$patch$);
  if position('-- v155 deposit' in definition)=0 then raise exception 'Unexpected visits payment definition';end if;
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
