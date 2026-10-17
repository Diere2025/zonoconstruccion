begin;
-- A later extra reopens only the new balance, not an already accepted residual.
do $$declare definition text; needle text; credit text;begin
 definition=pg_get_functiondef('public.pay_logistics_freight(uuid,uuid,jsonb,jsonb)'::regprocedure);
 needle='term.net_amount-paid or';
 credit='case when term.difference_acceptance is not null and (term.difference_acceptance->>''version'')::integer<=term.version and paid>=(term.difference_acceptance->>''paidAmount'')::numeric and term.net_amount>=(term.difference_acceptance->>''netAmount'')::numeric and (term.difference_acceptance->>''difference'')::numeric between -500 and -0.01 then -(term.difference_acceptance->>''difference'')::numeric else 0 end';
 if position(credit in definition)=0 then
  if position(needle in definition)=0 then raise exception 'No se encontró el control de saldo para conservar la diferencia aceptada';end if;
  execute replace(definition,needle,'term.net_amount-paid-('||credit||') or');
 end if;
end$$;
notify pgrst,'reload schema';
commit;
